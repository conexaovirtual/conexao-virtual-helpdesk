import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────
// Teste em modo SOMBRA: recebe o MESMO prompt/histórico que a Miya
// (waba-ai-agent, OpenAI) já usou pra responder de verdade, manda pra
// Claude (Anthropic) e só REGISTRA a resposta — nunca envia ao cliente.
// Objetivo: comparar qualidade lado a lado antes de decidir trocar de
// provedor. José pediu 20/07/2026, ver [[conexao-virtual-stack]] memória.
//
// Ferramentas de AÇÃO (create_ticket, close_ticket, escalate_to_human etc.)
// NUNCA são executadas aqui — só fica registrado o que a Claude teria
// chamado, com quais argumentos. Só as de LEITURA (busca na base de
// conhecimento, status de chamado, ativos, achar empresa) rodam de
// verdade, pra dar contexto real pro modelo continuar raciocinando.
// ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOOL_ROUNDS = 3;

// Nomes das tools que têm efeito colateral real (criam/alteram dado, mandam
// mensagem) — nunca executadas aqui, só logadas com os argumentos.
const ACTION_TOOL_NAMES = new Set([
  "create_ticket", "add_ticket_comment", "schedule_visit", "escalate_to_human",
  "partial_escalate", "resolve_conversation", "close_ticket", "link_contact",
  "register_asset", "create_schedule", "responder_orcamento", "solicitar_orcamento",
  "check_agenda", // leitura real, mas cruza várias tabelas — simplificado aqui
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let conversationId: string | null = null;
  let sourceMessageId: string | null = null;
  let customerMessage: string | null = null;

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      // Sem chave configurada: no-op silencioso (nunca deve derrubar o
      // fluxo real da Miya, que só dispara isto em "fire and forget").
      return new Response(JSON.stringify({ skipped: true, reason: "no_anthropic_key" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    conversationId = body.conversation_id || null;
    sourceMessageId = body.message_id || null;
    const companyId: string | null = body.company_id || null;
    const systemPrompt: string = body.system_prompt || "";
    const openaiChatHistory: any[] = Array.isArray(body.chat_history) ? body.chat_history : [];
    customerMessage = extractLastUserText(openaiChatHistory);

    const claudeMessages = toClaudeMessages(openaiChatHistory);
    const tools = getClaudeTools();

    let messages = claudeMessages;
    let round = 0;
    let finalText: string | null = null;
    const toolCallsLog: { name: string; input: any; simulated: boolean }[] = [];

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const resp = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API error ${resp.status}: ${errText.substring(0, 300)}`);
      }

      const result = await resp.json();
      const content: any[] = result.content || [];
      const textBlocks = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const toolUses = content.filter((b) => b.type === "tool_use");

      if (textBlocks) finalText = textBlocks;

      if (toolUses.length === 0) break;

      // Monta a resposta da assistant (com os tool_use) + os tool_result
      // correspondentes, pra próxima rodada — igual ao loop da Miya.
      const toolResultBlocks = [];
      for (const tu of toolUses) {
        const isAction = ACTION_TOOL_NAMES.has(tu.name);
        toolCallsLog.push({ name: tu.name, input: tu.input, simulated: isAction });
        const output = isAction
          ? { info: "Ação simulada — modo comparação, nada foi executado de verdade." }
          : await runReadOnlyTool(supabase, tu.name, tu.input, companyId);
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(output).substring(0, 2000),
        });
      }

      messages = [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: toolResultBlocks },
      ];

      if (result.stop_reason !== "tool_use") break;
    }

    await supabase.from("ai_shadow_comparisons").insert({
      conversation_id: conversationId,
      source_message_id: sourceMessageId,
      customer_message: customerMessage,
      claude_reply: finalText,
      claude_tool_calls: toolCallsLog.length ? toolCallsLog : null,
      claude_model: ANTHROPIC_MODEL,
      latency_ms: Date.now() - startedAt,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("waba-ai-shadow-claude error:", error);
    // Registra o erro também — útil saber se a Claude falhou nesse caso
    // (rate limit, formato de tool rejeitado, etc.) em vez de sumir do log.
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("ai_shadow_comparisons").insert({
        conversation_id: conversationId,
        source_message_id: sourceMessageId,
        customer_message: customerMessage,
        claude_model: ANTHROPIC_MODEL,
        latency_ms: Date.now() - startedAt,
        error: error.message?.substring(0, 500) || String(error),
      });
    } catch { /* melhor esforço — nunca propaga erro */ }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, // sempre 200: isto roda em background, não deve gerar retry/alerta
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

function extractLastUserText(openaiHistory: any[]): string | null {
  for (let i = openaiHistory.length - 1; i >= 0; i--) {
    const m = openaiHistory[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const t = m.content.find((c: any) => c.type === "text")?.text;
      if (t) return t;
    }
  }
  return null;
}

// Converte o histórico no formato OpenAI (o mesmo que a Miya monta) pro
// formato de mensagens da Claude. Imagem (visão) é omitida aqui — este
// teste compara só o texto; comparação com imagem fica pra uma fase 2.
function toClaudeMessages(openaiHistory: any[]): { role: string; content: string }[] {
  const converted = openaiHistory.map((m) => {
    let text: string;
    if (typeof m.content === "string") {
      text = m.content;
    } else if (Array.isArray(m.content)) {
      text = m.content.find((c: any) => c.type === "text")?.text || "[imagem — não comparada neste teste]";
    } else {
      text = "";
    }
    return { role: m.role === "assistant" ? "assistant" : "user", content: text };
  }).filter((m) => m.content.trim());

  // A API da Claude exige alternância estrita user/assistant — junta turnos
  // consecutivos do mesmo papel (pode acontecer pela filtragem acima).
  const merged: { role: string; content: string }[] = [];
  for (const m of converted) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content += "\n" + m.content;
    } else {
      merged.push({ ...m });
    }
  }
  // Tem que começar com "user"
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged;
}

async function runReadOnlyTool(supabase: any, name: string, input: any, companyId: string | null): Promise<any> {
  try {
    switch (name) {
      case "search_knowledge_base": {
        // Busca simplificada por palavra-chave (ilike) — a Miya de verdade
        // usa busca semântica por embedding; aqui é uma aproximação, não
        // uma réplica exata.
        const { data } = await supabase
          .from("knowledge_articles")
          .select("titulo, problema, solucao")
          .or(`titulo.ilike.%${input.query}%,problema.ilike.%${input.query}%,tags.ilike.%${input.query}%`)
          .limit(3);
        return { artigos: data || [] };
      }
      case "check_ticket_status": {
        const { data } = await supabase
          .from("tickets")
          .select("numero, titulo, status, prioridade")
          .eq("numero", input.numero)
          .maybeSingle();
        return data || { info: "Chamado não encontrado" };
      }
      case "list_company_assets": {
        let q = supabase.from("assets").select("nome, tipo, estado").eq("company_id", input.company_id || companyId);
        if (input.tipo) q = q.eq("tipo", input.tipo);
        if (input.estado) q = q.eq("estado", input.estado);
        const { data } = await q.limit(20);
        return { ativos: data || [] };
      }
      case "find_company": {
        const { data } = await supabase
          .from("companies")
          .select("id, nome_fantasia")
          .ilike("nome_fantasia", `%${input.nome}%`)
          .limit(5);
        return { empresas: data || [] };
      }
      default:
        return { info: "Ferramenta não simulada neste teste." };
    }
  } catch (err: any) {
    return { erro: err.message };
  }
}

function getClaudeTools() {
  return [
    { name: "create_ticket", description: "Cria um novo chamado de suporte. SOMENTE use após confirmação explícita do cliente.", input_schema: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" }, company_id: { type: "string" }, urgencia: { type: "string", enum: ["baixa", "media", "alta"] }, impacto: { type: "string", enum: ["baixo", "medio", "alto"] }, asset_id: { type: "string" } }, required: ["titulo", "descricao", "company_id", "urgencia", "impacto"] } },
    { name: "check_ticket_status", description: "Consulta o status de um chamado pelo número", input_schema: { type: "object", properties: { numero: { type: "number" } }, required: ["numero"] } },
    { name: "search_knowledge_base", description: "Busca artigos na base de conhecimento por palavra-chave. Use proativamente antes de responder dúvidas técnicas.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
    { name: "list_company_assets", description: "Lista os ativos (equipamentos) da empresa do cliente, com filtro opcional por tipo ou status", input_schema: { type: "object", properties: { company_id: { type: "string" }, tipo: { type: "string" }, estado: { type: "string" } }, required: ["company_id"] } },
    { name: "add_ticket_comment", description: "Adiciona um comentário a um chamado existente para follow-up ou atualização", input_schema: { type: "object", properties: { ticket_numero: { type: "number" }, comentario: { type: "string" } }, required: ["ticket_numero", "comentario"] } },
    { name: "schedule_visit", description: "Solicita agendamento de visita técnica para a empresa", input_schema: { type: "object", properties: { company_id: { type: "string" }, motivo: { type: "string" }, data_sugerida: { type: "string" } }, required: ["company_id", "motivo"] } },
    { name: "escalate_to_human", description: "Transfere COMPLETAMENTE a conversa para um técnico humano. A IA deixa de responder.", input_schema: { type: "object", properties: { reason: { type: "string" }, conversation_id: { type: "string" }, resumo: { type: "string" } }, required: ["reason", "conversation_id", "resumo"] } },
    { name: "partial_escalate", description: "Notifica um técnico sobre o problema mas mantém a IA ativa como copiloto.", input_schema: { type: "object", properties: { conversation_id: { type: "string" }, reason: { type: "string" }, resumo: { type: "string" }, urgencia: { type: "string", enum: ["baixa", "media", "alta"] } }, required: ["conversation_id", "reason", "resumo", "urgencia"] } },
    { name: "resolve_conversation", description: "Marca a conversa como resolvida quando o problema do cliente foi solucionado", input_schema: { type: "object", properties: { conversation_id: { type: "string" } }, required: ["conversation_id"] } },
    { name: "close_ticket", description: "Fecha/resolve um chamado quando o cliente confirma que o problema foi solucionado.", input_schema: { type: "object", properties: { ticket_numero: { type: "number" }, solucao: { type: "string" } }, required: ["ticket_numero", "solucao"] } },
    { name: "find_company", description: "Busca uma empresa cadastrada pelo nome.", input_schema: { type: "object", properties: { nome: { type: "string" } }, required: ["nome"] } },
    { name: "link_contact", description: "Vincula o contato atual a uma empresa existente.", input_schema: { type: "object", properties: { company_id: { type: "string" }, contact_name: { type: "string" } }, required: ["company_id"] } },
    { name: "register_asset", description: "Cadastra um novo ativo (equipamento) para a empresa do cliente.", input_schema: { type: "object", properties: { company_id: { type: "string" }, nome: { type: "string" }, tipo: { type: "string", enum: ["desktop", "notebook", "servidor", "impressora", "monitor", "roteador", "switch", "modem", "camera", "dvr", "outro"] }, fabricante: { type: "string" }, modelo: { type: "string" }, numero_serie: { type: "string" }, setor: { type: "string" } }, required: ["company_id", "nome", "tipo"] } },
    { name: "check_agenda", description: "Consulta a agenda de compromissos para uma data específica.", input_schema: { type: "object", properties: { data: { type: "string" } }, required: [] } },
    { name: "create_schedule", description: "Cria um novo agendamento (ordem de serviço).", input_schema: { type: "object", properties: { titulo: { type: "string" }, descricao: { type: "string" }, data: { type: "string" }, company_id: { type: "string" }, tipo_servico: { type: "string" } }, required: ["titulo", "descricao", "data"] } },
    { name: "responder_orcamento", description: "Registra a decisão do cliente sobre um orçamento PENDENTE.", input_schema: { type: "object", properties: { decisao: { type: "string", enum: ["aprovado", "recusado"] }, orcamento_numero: { type: "number" }, observacao: { type: "string" } }, required: ["decisao"] } },
    { name: "solicitar_orcamento", description: "Registra um PEDIDO de cotação/orçamento do cliente.", input_schema: { type: "object", properties: { resumo: { type: "string" } }, required: ["resumo"] } },
  ];
}
