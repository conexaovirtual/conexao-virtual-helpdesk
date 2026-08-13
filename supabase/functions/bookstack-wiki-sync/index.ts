// =============================================================================
//  bookstack-wiki-sync — espelha as páginas da wiki (BookStack) na tabela
//  wiki_pages e gera o embedding de cada uma, para busca semântica no chamado
//  e na Miya.
//
//  Puxa da wiki (pull), não recebe webhook: assim pega também edição manual e
//  página apagada, e não expõe endpoint público sem autenticação. Roda por cron
//  na VPS de 15 em 15 min.
//
//  Chamadas:
//    {}                 -> sincroniza (só reembeda o que mudou)
//    { force: true }    -> reembeda tudo, mesmo sem mudança
//    { query: "..." }   -> diagnóstico: devolve as páginas mais parecidas
//
//  ⚠️ A wiki é INTERNA. Só página com a tag "cliente" no BookStack recebe
//  visivel_cliente = true, e só essas a Miya pode usar em conversa com cliente.
// =============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims, igual ao embed-knowledge
const TAG_CLIENTE = "cliente";

async function embed(texto: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texto.slice(0, 8000) }),
  });
  if (!resp.ok) throw new Error(`OpenAI embeddings ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).data[0].embedding;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// HTML da página -> texto limpo para embeddar.
function htmlParaTexto(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

class BookStack {
  constructor(private url: string, private id: string, private secret: string) {}

  async req(caminho: string): Promise<any> {
    const resp = await fetch(`${this.url}${caminho}`, {
      headers: { Authorization: `Token ${this.id}:${this.secret}` },
    });
    if (!resp.ok) {
      throw new Error(`BookStack GET ${caminho} -> ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
    return await resp.json();
  }

  // Percorre a paginação até o fim (não confiar em uma página só de resultados).
  async listarTudo(recurso: string): Promise<any[]> {
    const itens: any[] = [];
    let offset = 0;
    for (;;) {
      const p = await this.req(`/api/${recurso}?count=100&offset=${offset}`);
      itens.push(...(p.data ?? []));
      if (itens.length >= (p.total ?? 0) || !(p.data ?? []).length) break;
      offset += 100;
    }
    return itens;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const BOOKSTACK_URL = (Deno.env.get("BOOKSTACK_URL") ?? "").replace(/\/$/, "");
    const TOKEN_ID = Deno.env.get("BOOKSTACK_TOKEN_ID");
    const TOKEN_SECRET = Deno.env.get("BOOKSTACK_TOKEN_SECRET");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");
    if (!BOOKSTACK_URL || !TOKEN_ID || !TOKEN_SECRET) throw new Error("credenciais do BookStack não configuradas");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { query, force } = body;

    // ---- diagnóstico: o que a busca acha para uma pergunta ----
    if (query) {
      const vec = await embed(query, OPENAI_API_KEY);
      const { data: achados, error } = await supabase.rpc("match_wiki_pages", {
        query_embedding: vec,
        match_count: 5,
        match_threshold: 0.0,
        p_somente_cliente: body.somente_cliente === true,
      });
      if (error) throw error;
      return new Response(
        JSON.stringify({
          ok: true,
          query,
          achados: (achados ?? []).map((m: any) => ({
            titulo: m.titulo,
            livro: m.livro,
            url: m.url,
            similaridade: Math.round(m.similarity * 1000) / 1000,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- sincronização ----
    const bs = new BookStack(BOOKSTACK_URL, TOKEN_ID, TOKEN_SECRET);

    const [livros, capitulos, resumoPaginas] = await Promise.all([
      bs.listarTudo("books"),
      bs.listarTudo("chapters"),
      bs.listarTudo("pages"),
    ]);
    const nomeLivro = new Map(livros.map((b: any) => [b.id, b.name]));
    const nomeCapitulo = new Map(capitulos.map((c: any) => [c.id, c.name]));

    const { data: existentes } = await supabase
      .from("wiki_pages")
      .select("bookstack_page_id, content_hash");
    const hashPorPagina = new Map(
      (existentes ?? []).map((r: any) => [r.bookstack_page_id, r.content_hash]),
    );

    let atualizadas = 0, embedadas = 0, inalteradas = 0;
    const erros: string[] = [];
    const idsVistos = new Set<number>();

    for (const resumo of resumoPaginas) {
      idsVistos.add(resumo.id);
      try {
        // Rascunho não entra na busca: é conteúdo inacabado.
        if (resumo.draft) { inalteradas++; continue; }

        const p = await bs.req(`/api/pages/${resumo.id}`);
        const texto = htmlParaTexto(p.html ?? "");
        const tags: string[] = (p.tags ?? []).flatMap((t: any) =>
          [t.name, t.value].filter(Boolean).map((x: string) => String(x).toLowerCase())
        );
        const visivelCliente = tags.includes(TAG_CLIENTE);
        const livro = nomeLivro.get(p.book_id) ?? null;
        const capitulo = p.chapter_id ? (nomeCapitulo.get(p.chapter_id) ?? null) : null;

        const paraEmbedar = [p.name, livro, capitulo, texto].filter(Boolean).join("\n");
        const hash = await sha256(`${paraEmbedar}|cliente=${visivelCliente}`);

        if (!force && hashPorPagina.get(p.id) === hash) { inalteradas++; continue; }

        const { error: upErr } = await supabase.from("wiki_pages").upsert({
          bookstack_page_id: p.id,
          titulo: p.name,
          livro,
          capitulo,
          url: `${BOOKSTACK_URL}/link/${p.id}`,
          conteudo: texto.slice(0, 20000),
          visivel_cliente: visivelCliente,
          content_hash: hash,
          updated_at: new Date().toISOString(),
        }, { onConflict: "bookstack_page_id" });
        if (upErr) throw upErr;
        atualizadas++;

        const vec = await embed(paraEmbedar, OPENAI_API_KEY);
        const { error: embErr } = await supabase.rpc("update_wiki_page_embedding", {
          p_bookstack_page_id: p.id,
          p_embedding: JSON.stringify(vec),
        });
        if (embErr) throw embErr;
        embedadas++;
      } catch (e) {
        erros.push(`página ${resumo.id}: ${String(e).slice(0, 200)}`);
      }
    }

    // Página apagada na wiki sai do espelho — senão a Miya cita documentação
    // que não existe mais.
    let removidas = 0;
    const idsEspelhados = (existentes ?? []).map((r: any) => r.bookstack_page_id);
    const sumidas = idsEspelhados.filter((id: number) => !idsVistos.has(id));
    if (sumidas.length) {
      const { error: delErr } = await supabase
        .from("wiki_pages").delete().in("bookstack_page_id", sumidas);
      if (delErr) erros.push(`remoção: ${delErr.message}`);
      else removidas = sumidas.length;
    }

    return new Response(
      JSON.stringify({
        ok: erros.length === 0,
        paginas_na_wiki: resumoPaginas.length,
        atualizadas, embedadas, inalteradas, removidas,
        erros,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
