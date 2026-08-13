// =============================================================================
//  bookstack-sync — publica os artigos da base de conhecimento como páginas na
//  wiki interna (BookStack, docs.conexaovirtual.cloud).
//
//  Estrutura criada na wiki:
//    Livro "Base de Conhecimento"
//      └── Capítulo por categoria (Hardware, Rede, Impressão, ...)
//            └── Página por artigo
//
//  Chamadas:
//    { article_id: "uuid" }  -> publica/atualiza um artigo
//    { all: true }           -> varre todos (backfill; pula os já em dia)
//    { dry_run: true }       -> só diz o que faria, não escreve nada
//
//  O id da página fica em knowledge_articles.bookstack_page_id, então
//  republicar ATUALIZA a página em vez de criar duplicada.
// =============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOME_LIVRO = "Base de Conhecimento";
const SEM_CATEGORIA = "Sem categoria";

interface Artigo {
  id: string;
  ticket_id: string | null;
  titulo: string;
  problema: string;
  solucao: string;
  tags: string[] | null;
  categoria: string | null;
  bookstack_page_id: number | null;
  updated_at: string;
  bookstack_synced_at: string | null;
  bookstack_content_hash: string | null;
}

// Hash do que de fato vai pra página. Serve pra saber se o artigo mudou desde a
// última publicação — updated_at NÃO serve, porque o gatilho
// update_knowledge_articles_updated_at dispara em qualquer update da linha,
// inclusive na gravação do próprio bookstack_page_id (aí todo artigo pareceria
// pendente e o backfill reescreveria tudo a cada execução).
async function hashConteudo(a: Artigo): Promise<string> {
  const bruto = JSON.stringify([
    a.titulo, a.problema, a.solucao, a.tags ?? [], a.categoria ?? "",
  ]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bruto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --------------------------------------------------------------- BookStack --
class BookStack {
  constructor(
    private url: string,
    private tokenId: string,
    private tokenSecret: string,
  ) {}

  async req(caminho: string, init: RequestInit = {}): Promise<any> {
    const resp = await fetch(`${this.url}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Token ${this.tokenId}:${this.tokenSecret}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const texto = await resp.text();
    if (!resp.ok) {
      throw new Error(`BookStack ${init.method ?? "GET"} ${caminho} -> ${resp.status}: ${texto.slice(0, 300)}`);
    }
    return texto ? JSON.parse(texto) : null;
  }

  // Procura pelo NOME exato para não criar um livro novo a cada execução.
  async garantirLivro(nome: string): Promise<number> {
    const busca = await this.req(`/api/books?filter[name]=${encodeURIComponent(nome)}&count=1`);
    if (busca?.data?.length) return busca.data[0].id;
    const criado = await this.req("/api/books", {
      method: "POST",
      body: JSON.stringify({
        name: nome,
        description: "Artigos gerados a partir de chamados resolvidos no helpdesk. Sincronizado automaticamente — editar aqui é seguro, mas o helpdesk sobrescreve ao republicar o artigo.",
      }),
    });
    return criado.id;
  }

  async garantirCapitulo(livroId: number, nome: string): Promise<number> {
    const busca = await this.req(
      `/api/chapters?filter[book_id]=${livroId}&filter[name]=${encodeURIComponent(nome)}&count=1`,
    );
    if (busca?.data?.length) return busca.data[0].id;
    const criado = await this.req("/api/chapters", {
      method: "POST",
      body: JSON.stringify({ book_id: livroId, name: nome }),
    });
    return criado.id;
  }

  async criarPagina(capituloId: number, titulo: string, html: string): Promise<number> {
    const p = await this.req("/api/pages", {
      method: "POST",
      body: JSON.stringify({ chapter_id: capituloId, name: titulo, html }),
    });
    return p.id;
  }

  // Devolve false se a página não existe mais (alguém apagou na wiki).
  async atualizarPagina(id: number, capituloId: number, titulo: string, html: string): Promise<boolean> {
    try {
      await this.req(`/api/pages/${id}`, {
        method: "PUT",
        body: JSON.stringify({ chapter_id: capituloId, name: titulo, html }),
      });
      return true;
    } catch (e) {
      if (String(e).includes("-> 404")) return false;
      throw e;
    }
  }
}

// ------------------------------------------------------------------ HTML ----
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

// A ai-knowledge-generator grava `solucao` como um array JSON de passos
// (["passo 1","passo 2"]) — os 44 artigos existentes são assim. Jogado direto
// numa página, isso vira JSON cru na tela. Aqui vira lista numerada.
function passos(texto: string): string[] | null {
  const t = texto.trim();
  if (!t.startsWith("[")) return null;
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v;
  } catch { /* não era JSON: cai no caminho de texto normal */ }
  return null;
}

// Texto vindo do helpdesk é markdown-ish simples; aqui só preservamos quebras
// de linha e escapamos o resto (nunca injetar HTML cru do banco na wiki).
function paragrafos(texto: string): string {
  const lista = passos(texto);
  if (lista) {
    return `<ol>\n${lista.map((p) => `  <li>${esc(p.trim())}</li>`).join("\n")}\n</ol>`;
  }
  return texto
    .split(/\n{2,}/)
    .map((bloco) => `<p>${esc(bloco.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function montarHtml(a: Artigo, urlHelpdesk: string): string {
  const partes: string[] = [];
  partes.push("<h2>Problema</h2>", paragrafos(a.problema));
  partes.push("<h2>Solução</h2>", paragrafos(a.solucao));

  if (a.tags?.length) {
    partes.push(`<p><strong>Tags:</strong> ${a.tags.map(esc).join(", ")}</p>`);
  }
  if (a.ticket_id) {
    const link = `${urlHelpdesk}/tickets/${a.ticket_id}`;
    partes.push(`<p><strong>Chamado de origem:</strong> <a href="${esc(link)}">${esc(a.ticket_id)}</a></p>`);
  }
  partes.push(
    `<hr><p><em>Página gerada automaticamente pelo helpdesk a partir de um chamado resolvido. ` +
    `Editar aqui é permitido, mas o conteúdo é sobrescrito se o artigo for republicado.</em></p>`,
  );
  return partes.join("\n");
}

// ------------------------------------------------------------------ main ----
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BOOKSTACK_URL = (Deno.env.get("BOOKSTACK_URL") ?? "").replace(/\/$/, "");
    const BOOKSTACK_TOKEN_ID = Deno.env.get("BOOKSTACK_TOKEN_ID");
    const BOOKSTACK_TOKEN_SECRET = Deno.env.get("BOOKSTACK_TOKEN_SECRET");
    const URL_HELPDESK = Deno.env.get("HELPDESK_URL") ?? "https://conexaovirtual.cloud";

    if (!BOOKSTACK_URL || !BOOKSTACK_TOKEN_ID || !BOOKSTACK_TOKEN_SECRET) {
      throw new Error("BOOKSTACK_URL / BOOKSTACK_TOKEN_ID / BOOKSTACK_TOKEN_SECRET não configurados");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { article_id, all: todos, dry_run: simulacao } = body;

    let consulta = supabase.from("knowledge_articles").select("*");
    if (article_id) {
      consulta = consulta.eq("id", article_id);
    } else if (!todos) {
      throw new Error("informe article_id ou all: true");
    }

    const { data, error } = await consulta;
    if (error) throw error;
    let artigos = (data ?? []) as Artigo[];

    // No modo "todos", pula o que já está em dia — evita reescrever as páginas
    // à toa e poluir o histórico de revisões da wiki.
    if (todos) {
      const pendentes: Artigo[] = [];
      for (const a of artigos) {
        if (!a.bookstack_page_id || a.bookstack_content_hash !== await hashConteudo(a)) {
          pendentes.push(a);
        }
      }
      artigos = pendentes;
    }

    if (artigos.length === 0) {
      return new Response(JSON.stringify({ ok: true, publicados: 0, mensagem: "nada pendente" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (simulacao) {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          seriam_publicados: artigos.length,
          titulos: artigos.map((a) => a.titulo),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bs = new BookStack(BOOKSTACK_URL, BOOKSTACK_TOKEN_ID, BOOKSTACK_TOKEN_SECRET);
    const livroId = await bs.garantirLivro(NOME_LIVRO);
    const capitulos = new Map<string, number>();

    const resultados: any[] = [];
    for (const a of artigos) {
      try {
        const categoria = (a.categoria ?? "").trim() || SEM_CATEGORIA;
        if (!capitulos.has(categoria)) {
          capitulos.set(categoria, await bs.garantirCapitulo(livroId, categoria));
        }
        const capituloId = capitulos.get(categoria)!;
        const html = montarHtml(a, URL_HELPDESK);

        let pageId = a.bookstack_page_id;
        let acao: string;
        if (pageId && await bs.atualizarPagina(pageId, capituloId, a.titulo, html)) {
          acao = "atualizada";
        } else {
          // Sem id, ou a página foi apagada na wiki: cria de novo.
          pageId = await bs.criarPagina(capituloId, a.titulo, html);
          acao = a.bookstack_page_id ? "recriada" : "criada";
        }

        const { error: upErr } = await supabase
          .from("knowledge_articles")
          .update({
            bookstack_page_id: pageId,
            bookstack_synced_at: new Date().toISOString(),
            bookstack_content_hash: await hashConteudo(a),
          })
          .eq("id", a.id);
        if (upErr) throw upErr;

        resultados.push({ id: a.id, titulo: a.titulo, page_id: pageId, acao });
      } catch (e) {
        resultados.push({ id: a.id, titulo: a.titulo, erro: String(e) });
      }
    }

    const falhas = resultados.filter((r) => r.erro);
    return new Response(
      JSON.stringify({
        ok: falhas.length === 0,
        publicados: resultados.length - falhas.length,
        falhas: falhas.length,
        livro: `${BOOKSTACK_URL}/books/base-de-conhecimento`,
        resultados,
      }),
      {
        status: falhas.length && falhas.length === resultados.length ? 500 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
