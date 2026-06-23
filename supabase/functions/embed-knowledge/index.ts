import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

function articleText(a: any): string {
  return [
    a.titulo,
    a.problema,
    a.solucao,
    a.categoria,
    Array.isArray(a.tags) ? a.tags.join(", ") : a.tags,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

async function embed(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`OpenAI embeddings ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.data[0].embedding;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { id, query } = body;

    // Modo teste/diagnóstico: dada uma pergunta, retorna os artigos mais similares
    if (query) {
      const vec = await embed(query, OPENAI_API_KEY);
      const { data: matches, error: matchErr } = await supabase.rpc("match_knowledge_articles", {
        query_embedding: vec,
        match_count: 5,
        match_threshold: 0.0,
      });
      if (matchErr) throw matchErr;
      return new Response(
        JSON.stringify({
          ok: true,
          query,
          matches: (matches || []).map((m: any) => ({
            titulo: m.titulo,
            categoria: m.categoria,
            similarity: Math.round(m.similarity * 1000) / 1000,
          })),
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Seleciona artigos a embar: um específico (trigger) ou todos sem embedding (backfill)
    let articlesQuery = supabase
      .from("knowledge_articles")
      .select("id, titulo, problema, solucao, categoria, tags");
    if (id) {
      articlesQuery = articlesQuery.eq("id", id);
    } else {
      articlesQuery = articlesQuery.is("embedding", null);
    }

    const { data: articles, error } = await articlesQuery.limit(100);
    if (error) throw error;

    let embedded = 0;
    const errors: string[] = [];

    for (const a of articles || []) {
      try {
        const vec = await embed(articleText(a), OPENAI_API_KEY);
        const { error: upErr } = await supabase.rpc("update_article_embedding", {
          p_id: a.id,
          p_embedding: JSON.stringify(vec),
        });
        if (upErr) throw upErr;
        embedded++;
      } catch (e: any) {
        errors.push(`${a.id}: ${e.message}`);
        console.error(`Falha ao embar ${a.id}:`, e.message);
      }
    }

    console.log(`embed-knowledge: ${embedded} artigo(s) embado(s)`);
    return new Response(
      JSON.stringify({ ok: true, embedded, errors }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    console.error("embed-knowledge error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
