import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText, sendWabaAudio } from "../_shared/waba-provider.ts";
import { previewSchedule, pickTechnician } from "../_shared/service-order-scheduler.ts";

const JOSE_TECNICO_ID = "e336e78e-c11a-48b5-8d69-2bb48cf6bb3b";

// Cliente sem contrato ("eventual") só pode ter OS agendada depois de uma
// confirmação explícita de valor+data (tool confirmar_visita_eventual),
// válida por 2h — janela generosa o bastante pra negociar, curta o
// bastante pra não deixar uma confirmação antiga "autorizando" uma visita
// completamente diferente meses depois (waba_conversations é 1 linha por
// telefone, permanente, não por conversa/sessão).
const VISITA_EVENTUAL_JANELA_MS = 2 * 60 * 60 * 1000;

async function getVisitaEventualConfirmacaoValida(supabase: any, conversationId: string): Promise<boolean> {
  const { data: conv } = await supabase
    .from("waba_conversations")
    .select("visita_eventual_confirmada_em")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.visita_eventual_confirmada_em) return false;
  const confirmedAt = new Date(conv.visita_eventual_confirmada_em).getTime();
  return Date.now() - confirmedAt <= VISITA_EVENTUAL_JANELA_MS;
}

// Token de uso único: some assim que a OS é criada com sucesso, pra não
// dar pra reaproveitar a mesma confirmação numa segunda visita depois.
async function clearVisitaEventualConfirmacao(supabase: any, conversationId: string) {
  await supabase
    .from("waba_conversations")
    .update({ visita_eventual_valor: null, visita_eventual_data: null, visita_eventual_confirmada_em: null })
    .eq("id", conversationId);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";
const AI_MODEL = "gpt-4o";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { conversation_id, message_id, message_content, phone_number, is_group, media_url, message_type } = await req.json();
    const isAudioMessage = message_type === "audio";
    console.log("AI Agent processing:", { conversation_id, message_content: message_content?.substring(0, 100), is_group, isAudioMessage });

    // Check if AI is enabled for this conversation
    const { data: conversation } = await supabase
      .from("waba_conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (!conversation?.ai_enabled) {
      console.log("AI disabled for conversation", conversation_id);
      return new Response(JSON.stringify({ skipped: true, reason: "ai_disabled" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // A IA nunca atende grupo (José pediu 27/07/2026 — atendimento em grupo
    // estava ficando confuso). waba-webhook já não deveria chamar esta
    // function pra mensagem de grupo, mas o corte fica aqui também por
    // segurança, caso algo mais invoque direto.
    if (is_group) {
      console.log("Group message, AI disabled for groups:", phone_number);
      return new Response(JSON.stringify({ skipped: true, reason: "group_ai_disabled" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Transcribe audio if needed
    let effectiveMessage = message_content || "";
    let rawTranscription: string | null = null;
    if (isAudioMessage && media_url) {
      console.log("Transcribing audio from:", media_url);
      const transcription = await transcribeAudio(media_url, OPENAI_API_KEY);
      console.log("Audio transcription:", transcription.substring(0, 200));
      rawTranscription = transcription;
      effectiveMessage = `[O cliente enviou uma mensagem de voz que foi transcrita automaticamente]: ${transcription}`;

      // Persiste a transcrição de volta na própria mensagem: sem isso, o
      // conteúdo salvo continua sendo o placeholder "[Mensagem de áudio]" e,
      // em qualquer turno seguinte, o histórico relido do banco perde o que
      // foi dito no áudio — a IA "esquece" e pergunta de novo o que era.
      const transcriptionFailed = transcription === "[Áudio recebido - não foi possível transcrever]";
      if (message_id && !transcriptionFailed) {
        const { error: updateErr } = await supabase
          .from("waba_messages")
          .update({ content: `🎤 ${transcription}` })
          .eq("id", message_id);
        if (updateErr) console.error("Failed to persist audio transcription:", updateErr);
      }
    }

    // ─── Desvio para o app de Finanças (José/Cíntia) ──────────────────────
    // Só consulta o app financeiro para os 2 números cadastrados, evitando
    // custo/latencia extra para clientes normais do helpdesk.
    const FINANCE_PHONES_FULL = ["5562999522470" /* José */, "5562984304701" /* Cíntia */];
    const onlyDigitsLocal = (s: string) => (s || "").replace(/\D/g, "");
    const phoneDigits = onlyDigitsLocal(phone_number);
    const isFinanceCandidate = FINANCE_PHONES_FULL.some(
      (p) => onlyDigitsLocal(p).slice(-8) === phoneDigits.slice(-8)
    );
    if (isFinanceCandidate && message_type !== "image") {
      const textoFinanceiro = (isAudioMessage ? rawTranscription : message_content) || "";
      if (textoFinanceiro.trim()) {
        try {
          const finResp = await fetch("https://lrywvryibmobftbeidtf.supabase.co/functions/v1/lancar-gasto", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": Deno.env.get("FINANCAS_WEBHOOK_SECRET") || "",
            },
            body: JSON.stringify({ phone: phone_number, texto: textoFinanceiro }),
          });
          const finResult = await finResp.json();
          if (finResp.ok && !finResult.skip) {
            await sendAndSaveReply(supabase, conversation_id, phone_number, finResult.reply);
            return new Response(JSON.stringify({ ok: true, financas: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        } catch (finErr) {
          console.error("Financas dispatch failed, falling back to helpdesk flow:", finErr);
        }

        // Gatilho "resumo"/"analise"/"dica": assistente de IA analisa os gastos
        if (/^(resumo|analise|análise|dica|dicas)\b/i.test(textoFinanceiro.trim())) {
          try {
            const anResp = await fetch("https://lrywvryibmobftbeidtf.supabase.co/functions/v1/analisar-financas", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": Deno.env.get("FINANCAS_WEBHOOK_SECRET") || "",
              },
              body: JSON.stringify({ phone: phone_number }),
            });
            const anResult = await anResp.json();
            if (anResp.ok && !anResult.skip) {
              await sendAndSaveReply(supabase, conversation_id, phone_number, anResult.reply);
              return new Response(JSON.stringify({ ok: true, financas: true }), {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              });
            }
          } catch (anErr) {
            console.error("Analise financas dispatch failed, falling back to helpdesk flow:", anErr);
          }
        }
      }
    }

    // Download image so the model can analyze it (gpt-4o-mini tem visão)
    const isImageMessage = message_type === "image";
    let imageDataUrl: string | null = null;
    const isPlaceholder = (c?: string) =>
      !c || !c.trim() || c === "[Mensagem sem texto]" || /^[a-f0-9-]+_[A-Z0-9]+\.\w+$/.test(c.trim());
    if (isImageMessage && media_url) {
      console.log("Fetching image from:", media_url);
      imageDataUrl = await fetchImageAsDataUrl(media_url);
      const caption = isPlaceholder(message_content) ? "" : message_content;
      effectiveMessage = caption
        ? `[O cliente enviou uma imagem com a legenda]: ${caption}`
        : "[O cliente enviou uma imagem]";
    }

    // Gather enriched context
    const context = await gatherContext(supabase, phone_number, effectiveMessage);

    // Departamento da conversa (Fase 0 da "empresa virtual") + conhecimento
    // já aprovado pela diretoria (José) pra esse departamento — nunca inclui
    // proposta ainda pendente, só o que já foi aprovado e aplicado.
    context.departamento = conversation.departamento_atual || "triagem";
    const { data: deptKnowledge } = await supabase
      .from("department_knowledge_base")
      .select("secao, conteudo")
      .eq("departamento", context.departamento)
      .order("secao");
    context.departmentKnowledge = deptKnowledge || [];

    const systemPrompt = buildSystemPrompt(context);

    // Get conversation history (last 40 messages)
    const { data: recentMessages } = await supabase
      .from("waba_messages")
      .select("direction, content, sender_type, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(40);

    // Janela de 30 mensagens: com menos que isso a IA "esquece" o que já
    // perguntou na mesma conversa e repete perguntas ao cliente.
    // Exclude messages with no real content (e.g. "[Mensagem sem texto]", filenames)
    const chatHistory = (recentMessages || [])
      .reverse()
      .filter((m: any) => {
        const c = (m.content || "").trim();
        return c && c !== "[Mensagem sem texto]" && !c.match(/^[a-f0-9-]+_[A-Z0-9]+\.\w+$/);
      })
      .slice(-30)
      .map((m: any) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content || "",
      }));

    // A linha do áudio entra na history como nome de arquivo e é filtrada acima,
    // então a transcrição NUNCA está no chatHistory. Garantimos que ela seja a
    // última fala do usuário (append), independente do estado do histórico —
    // antes, quando o histórico filtrado ficava vazio, a transcrição era descartada
    // e a IA respondia só uma saudação genérica.
    // Se a transcrição já foi persistida na própria mensagem (via message_id
    // acima), ela já vem naturalmente no histórico lido do banco — evita
    // duplicar a fala do cliente no prompt. Só fazemos o append manual como
    // fallback quando não foi possível persistir (ex: sem message_id).
    if (isAudioMessage && !message_id) {
      chatHistory.push({ role: "user", content: effectiveMessage });
    }

    // Inject the image as a multimodal message so the model can actually see it.
    // The inbound image row is usually filtered out of chatHistory (placeholder/filename),
    // so we attach it to the last user turn or append a fresh one.
    if (isImageMessage && imageDataUrl) {
      const visionContent = [
        { type: "text", text: effectiveMessage },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ];
      const lastIdx = chatHistory.length - 1;
      if (lastIdx >= 0 && chatHistory[lastIdx].role === "user") {
        chatHistory[lastIdx].content = visionContent as any;
      } else {
        chatHistory.push({ role: "user", content: visionContent as any });
      }
    } else if (isImageMessage && !imageDataUrl) {
      // Falha ao baixar a imagem: ainda assim avisa o modelo em texto
      const lastIdx = chatHistory.length - 1;
      if (lastIdx >= 0 && chatHistory[lastIdx].role === "user") {
        chatHistory[lastIdx].content = effectiveMessage;
      } else {
        chatHistory.push({ role: "user", content: effectiveMessage });
      }
    }

    // ─── Teste em modo sombra (Claude) ────────────────────────────────
    // Dispara em paralelo, sem bloquear nem afetar a resposta real ao
    // cliente (fire-and-forget; qualquer falha é só logada). Só roda de
    // fato se AI_SHADOW_CLAUDE_ENABLED=true E a secret ANTHROPIC_API_KEY
    // existir (a própria function faz no-op sem a chave).
    if ((Deno.env.get("AI_SHADOW_CLAUDE_ENABLED") || "").toLowerCase() === "true") {
      const shadowCall = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/waba-ai-shadow-claude`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          conversation_id,
          message_id,
          company_id: context.companyId || null,
          system_prompt: systemPrompt,
          chat_history: chatHistory,
        }),
      }).catch((e) => console.error("Shadow Claude dispatch failed (non-blocking):", e));
      // @ts-ignore — EdgeRuntime é global do runtime do Supabase, sem tipos no editor
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(shadowCall);
    }

    // Call AI with upgraded model
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
        ],
        tools: getTools(),
        tool_choice: "auto",
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];

    if (!choice) throw new Error("No AI response");

    const isFirstResponse = !conversation.first_response_at;

    // Handle tool calls with multi-round support (up to 3 rounds)
    let currentMessage = choice.message;
    let messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
    ];
    
    const MAX_TOOL_ROUNDS = 3;
    let round = 0;
    
    while (currentMessage?.tool_calls?.length && round < MAX_TOOL_ROUNDS) {
      round++;
      console.log(`Tool call round ${round}:`, currentMessage.tool_calls.map((tc: any) => tc.function?.name).join(", "));
      
      const toolResults = await handleToolCalls(supabase, currentMessage.tool_calls, phone_number, conversation_id, context);
      
      messages = [
        ...messages,
        currentMessage,
        ...toolResults,
      ];

      const followUpResponse = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          tools: getTools(),
          tool_choice: "auto",
        }),
      });

      if (!followUpResponse.ok) {
        console.error(`Follow-up round ${round} failed:`, followUpResponse.status);
        break;
      }

      const followUp = await followUpResponse.json();
      currentMessage = followUp.choices?.[0]?.message;
      
      if (!currentMessage) {
        console.error(`No message in follow-up round ${round}`);
        break;
      }
    }

    // Send final text response — if AI exhausted tool rounds without generating text, send a fallback
    let finalContent = currentMessage?.content?.trim() || null;
    if (!finalContent && round > 0) {
      // Generate a proper farewell since the AI resolved but forgot to reply
      const fallbackResponse = await fetch(AI_GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            ...messages,
            { role: "user", content: "[SISTEMA] Você executou ações mas não enviou uma resposta ao cliente. Gere uma mensagem curta e amigável confirmando o que foi feito (ex: chamado fechado, conversa encerrada, etc)." },
          ],
        }),
      });
      if (fallbackResponse.ok) {
        const fallbackResult = await fallbackResponse.json();
        finalContent = fallbackResult.choices?.[0]?.message?.content;
      }
      if (!finalContent) {
        finalContent = "Pronto, feito! Se precisar de mais alguma coisa, é só chamar.";
      }
      console.log("Fallback reply generated after", round, "tool rounds");
    }
    if (finalContent) {
      // Strip any tool call JSON that the AI accidentally wrote as text
      finalContent = finalContent.replace(/\{\s*"tool_code"[\s\S]*?\}/g, "").trim();
      finalContent = finalContent.replace(/\{\s*"function"[\s\S]*?\}/g, "").trim();
      finalContent = finalContent.replace(/\{\s*"parameters"[\s\S]*?\}/g, "").trim();
      if (finalContent) {
        // Simulate human typing delay (2-5 seconds) based on message length
        const baseDelay = 2000;
        const charDelay = Math.min(finalContent.length * 15, 3000); // up to 3s extra for longer messages
        const randomJitter = Math.random() * 1000;
        const typingDelay = baseDelay + charDelay + randomJitter;
        console.log(`Simulating typing delay: ${Math.round(typingDelay)}ms for ${finalContent.length} chars`);
        await new Promise(r => setTimeout(r, typingDelay));
        
        await sendAndSaveReply(supabase, conversation_id, phone_number, finalContent);
        if (isFirstResponse) await trackFirstResponse(supabase, conversation_id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("AI Agent error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

// ─── Context Gathering (Enriched) ────────────────────────────────────

async function gatherContext(supabase: any, phone: string, message: string) {
  // ─── Detect [ASSET:uuid] tag from QR code labels ─────────────────
  let assetFromTag: any = null;
  let assetTicketHistory: any[] = [];
  const assetTagMatch = message.match(/\[ASSET:([a-f0-9-]{36})\]/i);
  
  if (assetTagMatch) {
    const assetId = assetTagMatch[1];
    console.log("Asset tag detected:", assetId);
    
    const [assetResult, ticketHistoryResult] = await Promise.all([
      supabase
        .from("assets")
        .select("id, nome, tipo, estado, fabricante, modelo, numero_serie, setor, local, sistema_operacional, company_id, companies:company_id(id, nome_fantasia, tipo_contrato, sla_primeiro_atendimento_horas, sla_solucao_horas)")
        .eq("id", assetId)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("numero, titulo, descricao, solucao, status, prioridade, created_at, data_solucao")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    
    if (assetResult.data) {
      assetFromTag = assetResult.data;
      assetTicketHistory = ticketHistoryResult.data || [];
      console.log(`Asset found: ${assetFromTag.nome}, company: ${assetFromTag.companies?.nome_fantasia}, history: ${assetTicketHistory.length} tickets`);
      
      // Auto-link contact to asset's company if not linked yet
      const { data: existingContact } = await supabase
        .from("whatsapp_contacts")
        .select("company_id")
        .eq("phone_number", phone)
        .maybeSingle();
      
      if (!existingContact?.company_id && assetFromTag.company_id) {
        await supabase
          .from("whatsapp_contacts")
          .upsert({
            phone_number: phone,
            company_id: assetFromTag.company_id,
            last_message_at: new Date().toISOString(),
          }, { onConflict: "phone_number" });
        console.log(`Auto-linked contact ${phone} to company ${assetFromTag.company_id} via asset tag`);
      }
    }
  }

  // Extract keywords from message for relevant search
  const cleanMessage = message.replace(/\[ASSET:[a-f0-9-]+\]/i, "").trim();
  const keywords = cleanMessage
    .toLowerCase()
    .replace(/[^\w\sáéíóúãõâêô]/g, "")
    .split(/\s+/)
    .filter((w: string) => w.length > 3)
    .slice(0, 5);

  // Run all queries in parallel
  const [contactResult, relevantArticles, fallbackArticles] = await Promise.all([
    supabase
      .from("whatsapp_contacts")
      .select("*, companies:company_id(nome_fantasia, id, tipo_contrato, sla_primeiro_atendimento_horas, sla_solucao_horas)")
      .eq("phone_number", phone)
      .maybeSingle(),
    // Search relevant articles by keywords
    keywords.length > 0
      ? supabase
          .from("knowledge_articles")
          .select("titulo, problema, solucao, categoria, tags")
          .or(keywords.map((k: string) => `problema.ilike.%${k}%,solucao.ilike.%${k}%,titulo.ilike.%${k}%`).join(","))
          .order("util_count", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    // Fallback: top articles by usefulness
    supabase
      .from("knowledge_articles")
      .select("titulo, problema, solucao, categoria, tags")
      .order("util_count", { ascending: false })
      .limit(5),
  ]);

  const contact = contactResult.data;

  // Se contato não tem empresa vinculada, buscar em company_contacts pelo número
  let autoLinkedCompanyId: string | null = null;
  let multipleCompanies: { id: string; nome_fantasia: string }[] = [];
  if (!contact?.company_id && !assetFromTag?.company_id) {
    // Variantes BR do número: com e sem o 9º dígito (cadastros e JIDs divergem nisso)
    const digits = phone.replace(/\D/g, "");
    const phoneVariants = new Set([digits]);
    if (digits.startsWith("55") && digits.length === 12) {
      phoneVariants.add(digits.slice(0, 4) + "9" + digits.slice(4));
    } else if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
      phoneVariants.add(digits.slice(0, 4) + digits.slice(5));
    }
    const { data: ccMatches } = await supabase
      .from("company_contacts")
      .select("company_id, nome, companies:company_id(id, nome_fantasia)")
      .in("whatsapp", [...phoneVariants]);

    if (ccMatches && ccMatches.length === 1) {
      // Identificação automática: vincula à empresa encontrada
      autoLinkedCompanyId = (ccMatches[0].companies as any)?.id || ccMatches[0].company_id;
      const contactNome = ccMatches[0].nome;
      await supabase
        .from("whatsapp_contacts")
        .upsert(
          { phone_number: phone, contact_name: contactNome, company_id: autoLinkedCompanyId },
          { onConflict: "phone_number" }
        );
      console.log(`[waba-ai-agent] Auto-identificado via company_contacts: ${contactNome} → ${autoLinkedCompanyId}`);
    } else if (ccMatches && ccMatches.length > 1) {
      // Múltiplas empresas: a IA vai perguntar qual
      multipleCompanies = ccMatches.map((m: any) => ({ id: m.companies?.id, nome_fantasia: m.companies?.nome_fantasia }));
      console.log(`[waba-ai-agent] Múltiplas empresas para ${phone}: ${multipleCompanies.map(c => c.nome_fantasia).join(", ")}`);
    }
  }

  // Use asset's company if contact has no company
  const companyId = contact?.company_id || autoLinkedCompanyId || assetFromTag?.company_id || null;

  // ─── Contato sem empresa: avisa o José UMA vez pra cadastrar ────────
  if (!companyId && multipleCompanies.length === 0) {
    const lastNotified = contact?.unregistered_notified_at ? new Date(contact.unregistered_notified_at).getTime() : 0;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastNotified > THIRTY_DAYS) {
      const nomeExibicao = contact?.contact_name?.trim() || "sem nome na agenda";
      const excerpt = cleanMessage.length > 120 ? cleanMessage.slice(0, 120) + "…" : cleanMessage;
      try {
        await supabase
          .from("whatsapp_contacts")
          .upsert(
            { phone_number: phone, unregistered_notified_at: new Date().toISOString() },
            { onConflict: "phone_number" }
          );
        await notifyTechnician(
          `🆕 *Contato não cadastrado* falou com a Miya:\n${nomeExibicao} — ${phone}\nMensagem: "${excerpt}"\n\nPra eu reconhecer essa pessoa: Empresas → empresa dele(a) → Contatos → adicionar nome e esse número. Se não for cliente, é só ignorar.`
        );
        console.log(`[waba-ai-agent] José notificado: contato não cadastrado ${phone}`);
      } catch (e) {
        console.error("Falha ao notificar contato não cadastrado:", e);
      }
    }
  }

  // Merge relevant + fallback articles (deduplicated)
  const allArticles = relevantArticles.data || [];
  const seenIds = new Set(allArticles.map((a: any) => a.titulo));
  for (const a of (fallbackArticles.data || [])) {
    if (!seenIds.has(a.titulo)) {
      allArticles.push(a);
      seenIds.add(a.titulo);
    }
  }

  // Company-specific queries (run in parallel if company exists)
  let openTickets: any[] = [];
  let visits: any[] = [];
  let assets: any[] = [];
  let recentServices: any[] = [];

  if (companyId) {
    const [ticketsResult, visitsResult, assetsResult, servicesResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("numero, titulo, status, prioridade, tecnico_id, created_at, profiles:tecnico_id(nome)")
        .eq("company_id", companyId)
        .in("status", ["novo", "em_atendimento"])
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("visit_schedules")
        .select("proxima_visita, motivo, status, prioridade")
        .eq("company_id", companyId)
        .eq("status", "pendente")
        .order("proxima_visita", { ascending: true })
        .limit(5),
      supabase
        .from("assets")
        .select("id, nome, tipo, estado, fabricante, modelo, setor, local")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("daily_service_records")
        .select("titulo, descricao, solucao, status, data_atendimento, canal")
        .eq("company_id", companyId)
        .order("data_atendimento", { ascending: false })
        .limit(3),
    ]);

    openTickets = ticketsResult.data || [];
    visits = visitsResult.data || [];
    assets = assetsResult.data || [];
    recentServices = servicesResult.data || [];
  }

  // ─── Orçamento pendente mais recente da empresa ────────────────
  let pendingOrcamento: any = null;
  if (companyId) {
    const { data: orc } = await supabase
      .from("orcamentos")
      .select("id, numero, valor_total, validade, status")
      .eq("company_id", companyId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    pendingOrcamento = orc || null;
  }

  // ─── Gather today's agenda (global, not company-specific) ──────
  const todayStr = new Date().toISOString().split("T")[0];
  let todayAgenda: any[] = [];
  try {
    const [todayOsResult, todayVisitsResult] = await Promise.all([
      supabase
        .from("service_orders")
        .select("numero_os, descricao_servicos, hora_agendada, modalidade, tipo_servico, status, prioridade, companies:company_id(nome_fantasia)")
        .gte("data_agendada", `${todayStr}T00:00:00`)
        .lte("data_agendada", `${todayStr}T23:59:59`)
        .order("hora_agendada"),
      supabase
        .from("visit_schedules")
        .select("proxima_visita, motivo, prioridade, companies:company_id(nome_fantasia)")
        .eq("proxima_visita", todayStr)
        .eq("status", "pendente"),
    ]);
    todayAgenda = [
      ...(todayOsResult.data || []).map((o: any) => ({
        type: "OS",
        hora: o.hora_agendada?.substring(0, 5) || "--:--",
        descricao: `OS #${o.numero_os} - ${o.companies?.nome_fantasia || "N/A"} (${o.tipo_servico || "corretivo"}, ${o.modalidade || "presencial"})`,
        status: o.status,
        prioridade: o.prioridade,
      })),
      ...(todayVisitsResult.data || []).map((v: any) => ({
        type: "Visita",
        hora: "--:--",
        descricao: `Visita - ${v.companies?.nome_fantasia || "N/A"} (${v.motivo})`,
        status: "pendente",
        prioridade: v.prioridade,
      })),
    ].sort((a, b) => a.hora.localeCompare(b.hora));
  } catch (e) {
    console.error("Error fetching today's agenda:", e);
  }

  return { articles: allArticles, contact, openTickets, visits, assets, recentServices, companyId, assetFromTag, assetTicketHistory, todayAgenda, pendingOrcamento, multipleCompanies };
}

// ─── Proteção de credenciais ─────────────────────────────────────────
// A Miya conversa com CLIENTE no WhatsApp, e a base de conhecimento é escrita
// por IA a partir de atendimentos — já apareceu artigo com usuário e senha de
// máquina de cliente em texto puro (caso BlueColor, 12/08/2026). Como não dá
// para confiar que isso não se repita, mascaramos na saída, nos DOIS caminhos
// por onde artigo chega nela: o prompt do sistema e a ferramenta de busca.
//
// Prefere errar mascarando demais: técnico vê o texto completo no helpdesk.
const AVISO_CREDENCIAL = "(credencial não exibida — consultar no NexoRMM)";
const CHAVE_CREDENCIAL =
  "senhas?|passwords?|pass|credenciais?|credencial|usu[áa]rios?|logins?|users?";

// Só trata como credencial o que TEM CARA de valor (dígito, símbolo, CamelCase
// ou ponto no meio). Sem isso, "trocar a senha depois" viraria máscara e a
// resposta da Miya ficaria sem sentido.
function pareceCredencial(v: string): boolean {
  return /\d/.test(v) || /[@#$%!_\-*]/.test(v) || /[a-z][A-Z]/.test(v) || /\w\.\w/.test(v);
}

export function mascararCredenciais(texto: string): string {
  if (!texto) return texto;
  let saida = texto;

  // A) Valor ENTRE ASPAS até ~40 caracteres depois da palavra-chave. Pega
  //    "usuário ... com o nome 'BlueColor_TX8'", em que o valor fica longe.
  saida = saida.replace(
    new RegExp(`\\b(${CHAVE_CREDENCIAL})\\b([^'"«]{0,40}?)(['"«])([^'"»]{2,})(['"»])`, "gi"),
    (_m, chave, meio) => `${chave}${meio}${AVISO_CREDENCIAL}`,
  );

  // B) Valor SOLTO logo depois da palavra-chave ("senha: Xyz@2026").
  saida = saida.replace(
    new RegExp(`\\b(${CHAVE_CREDENCIAL})\\b(\\s*(?:é|eh|is|:|=|como|sendo)?\\s*)([A-Za-z0-9@#$%!._\\-]{4,})`, "gi"),
    (m, chave, meio, bruto) => {
      // Pontuação final não faz parte do valor: sem separar, o ponto de
      // "senha depois." conta como símbolo e vira falso positivo.
      const fim = bruto.match(/[.,;:!?]+$/)?.[0] ?? "";
      const valor = fim ? bruto.slice(0, -fim.length) : bruto;
      if (valor.length < 4 || !pareceCredencial(valor)) return m;
      return `${chave}${meio}${AVISO_CREDENCIAL}${fim}`;
    },
  );

  return saida;
}

// ─── System Prompt (Enhanced) ────────────────────────────────────────

function buildSystemPrompt(context: any) {
  const articlesText = (context.articles || [])
    .map((a: any) => mascararCredenciais(`• **${a.titulo}**: ${a.problema} → ${a.solucao}`))
    .join("\n");

  const ticketsText = (context.openTickets || [])
    .map((t: any) => {
      const tecnico = t.profiles?.nome || "não atribuído";
      return `• #${t.numero} - ${t.titulo} (${t.status}, prioridade: ${t.prioridade}, técnico: ${tecnico})`;
    })
    .join("\n");

  const visitsText = (context.visits || [])
    .map((v: any) => `• ${v.proxima_visita} - ${v.motivo} (${v.status}, prioridade: ${v.prioridade})`)
    .join("\n");

  const assetsText = (context.assets || [])
    .map((a: any) => `• ${a.nome} (${a.tipo}, ${a.estado}) - ${a.fabricante || ""} ${a.modelo || ""} | Setor: ${a.setor || "N/A"} | Local: ${a.local || "N/A"}`)
    .join("\n");

  const servicesText = (context.recentServices || [])
    .map((s: any) => `• [${s.data_atendimento}] ${s.titulo}: ${s.descricao?.substring(0, 80)}${s.solucao ? ` → Solução: ${s.solucao.substring(0, 80)}` : ""}`)
    .join("\n");

  const companyName = context.assetFromTag?.companies?.nome_fantasia || context.contact?.companies?.nome_fantasia || "não identificada";
  const companyId = context.companyId || null;
  const contractType = context.assetFromTag?.companies?.tipo_contrato || context.contact?.companies?.tipo_contrato || "N/A";
  const contactName = context.contact?.contact_name || "não identificado";
  const multipleCompanies: { id: string; nome_fantasia: string }[] = context.multipleCompanies || [];

  // Build asset-from-tag context section
  let assetTagSection = "";
  if (context.assetFromTag) {
    const a = context.assetFromTag;
    const historyText = (context.assetTicketHistory || [])
      .map((t: any) => `  - #${t.numero} "${t.titulo}" (${t.status}) ${t.solucao ? `→ Solução: ${t.solucao.substring(0, 100)}` : ""}`)
      .join("\n");
    
    assetTagSection = `
═══════════════════════════════════════
🏷️ ATIVO IDENTIFICADO VIA QR CODE (ETIQUETA):
═══════════════════════════════════════
Nome: ${a.nome}
Tipo: ${a.tipo} | Estado: ${a.estado}
Fabricante: ${a.fabricante || "N/A"} | Modelo: ${a.modelo || "N/A"}
Nº Série: ${a.numero_serie || "N/A"}
Setor: ${a.setor || "N/A"} | Local: ${a.local || "N/A"}
SO: ${a.sistema_operacional || "N/A"}
Asset ID: ${a.id}

HISTÓRICO DE CHAMADOS DESTE ATIVO (${(context.assetTicketHistory || []).length}):
${historyText || "  Nenhum chamado anterior para este ativo."}

⚡ INSTRUÇÃO ESPECIAL: O cliente escaneou a etiqueta QR deste equipamento. Você JÁ SABE qual é o ativo. Ao abrir chamado, vincule AUTOMATICAMENTE o asset_id "${a.id}". Pergunte apenas o problema.
`;
  }

  // ─── Detect business hours (BRT = UTC-3) ──────────────────────────
  const now = new Date();
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  const isBusinessHours = brtHour >= 8 && brtHour < 18 && now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const businessHoursContext = isBusinessHours
    ? "Estamos em HORÁRIO COMERCIAL (seg-sex 08:00-18:00 BRT). A equipe está disponível."
    : `Estamos FORA DO HORÁRIO COMERCIAL (agora são ${String(brtHour).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} BRT). Nosso horário é seg-sex 08:00-18:00. Registre o chamado normalmente, mas informe que o retorno da equipe será no próximo dia útil.`;

  // Saudação por horário (BRT)
  const greetingByHour = brtHour >= 5 && brtHour < 12
    ? "Bom dia"
    : brtHour >= 12 && brtHour < 18
      ? "Boa tarde"
      : "Boa noite";

  return `Você é um membro da equipe de suporte da Conexão Virtual conversando por WhatsApp. Responda SEMPRE em português brasileiro.

═══════════════════════════════════════
🎯 PRINCÍPIO CENTRAL — LEIA E SIGA SEM EXCEÇÃO:
═══════════════════════════════════════
RESPONDA O QUE O CLIENTE PERGUNTOU, com calor humano. NUNCA traga assunto novo. NUNCA antecipe. NUNCA cite chamados, agenda, ativos ou histórico a menos que o cliente PERGUNTE explicitamente sobre eles.

Você é uma pessoa real da equipe: atenciosa, cordial e acolhedora. O cliente precisa SENTIR que está falando com gente, não com um sistema. Curto não é seco: uma resposta pode ser breve e ainda assim calorosa.

═══════════════════════════════════════
💬 TOM DE VOZ — COMO A GENTE FALA COM CLIENTE:
═══════════════════════════════════════
- Cordial e respeitoso, como um atendente de confiança que conhece o cliente há anos. Profissional sem ser frio, próximo sem ser folgado.
- Use o nome do cliente de vez em quando (não em toda mensagem).
- VARIE as palavras. NUNCA repita a mesma frase, a mesma saudação ou a mesma fórmula duas vezes na mesma conversa. Se já disse "Como posso ajudar?", da próxima vez formule diferente.
- NUNCA dê resposta que soe como "não é problema meu" ou que encerre a conversa na cara do cliente. Mesmo dizendo não, mostre boa vontade e deixe a porta aberta.
- Sem intimidade forçada ("meu querido", "amigão") e sem jargão corporativo ("Prezado", "Informamos que", "Acuso recebimento").

═══════════════════════════════════════
🎭 IDENTIDADE:
═══════════════════════════════════════
- Membro da EQUIPE de suporte da Conexão Virtual. NUNCA se identifique como "IA", "inteligência artificial", "chatbot", "assistente virtual", "bot", "robô", "sistema" ou "modelo de linguagem".
- Português brasileiro natural. Sem jargão corporativo ("Prezado", "Informamos que", "Acuso recebimento").
- Sem gírias forçadas.

═══════════════════════════════════════
🧰 ESCOPO DE SERVIÇOS — O QUE A CONEXÃO VIRTUAL FAZ (E O QUE NÃO FAZ):
═══════════════════════════════════════
A Conexão Virtual trabalha SOMENTE com infraestrutura de TI para EMPRESAS:
✅ Manutenção de computadores, notebooks e servidores (preventiva e corretiva)
✅ Rede de dados (cabeamento, switches, roteadores, Wi-Fi corporativo, internet)
✅ Suporte técnico de informática para empresas

❌ NÃO FAZEMOS — NUNCA ofereça, orce, agende ou abra chamado para:
- Câmeras / CFTV / videomonitoramento (nem instalação, nem manutenção, nem orçamento)
- Alarmes, cerca elétrica, interfone, portão eletrônico ou qualquer segurança eletrônica
- Elétrica predial, telefonia fixa, ar-condicionado ou qualquer serviço fora de TI
- Atendimento a RESIDÊNCIAS ou consumidor final (pessoa física) — atendemos SOMENTE empresas

Se o cliente pedir algo fora do escopo, recuse COM JEITO — nunca seque o cliente:
→ Agradeça por ter lembrado da gente, explique com carinho que esse serviço específico a gente não atende porque somos especializados em TI, e deixe claro que pra qualquer coisa de informática ele pode contar com a gente.
→ Exemplo do tom (varie as palavras, NUNCA copie igual): "Poxa, que bom que você lembrou da gente! Esse serviço específico a gente acaba não atendendo — nosso foco é manutenção de computadores, servidores e rede de dados pra empresas. Mas qualquer coisa nessa parte de informática, pode contar com a gente, tá bom?"
→ PROIBIDO responder só "não fazemos isso" e encerrar. Sempre mostre boa vontade e deixe a porta aberta.
→ NÃO chame create_ticket, solicitar_orcamento, create_schedule nem schedule_visit para serviço fora do escopo.
→ Em dúvida se o pedido é de TI ou não, faça UMA pergunta curta para esclarecer antes de recusar.

═══════════════════════════════════════
📏 FORMATO:
═══════════════════════════════════════
- Mensagens curtas, de WhatsApp: 1 a 3 frases. Só passe disso se o cliente pediu uma explicação que realmente exige.
- 1 mensagem por turno. Nunca quebrar em duas.
- Um reconhecimento breve e natural é bem-vindo quando encaixa ("deixa comigo", "já verifico isso pra você") — mas varie as palavras e não use em toda mensagem.
- Se precisar de informação, faça UMA pergunta clara por vez. NUNCA pergunte de novo algo que o cliente já respondeu nesta conversa.
- PROIBIDO: markdown, listas, bullets, separadores, títulos, blocos longos.
- Emojis: 1 no máximo, e só se realmente couber. Nunca empilhar.

═══════════════════════════════════════
🚫 REGRA DE OURO — NÃO SE ADIANTE:
═══════════════════════════════════════
Se a mensagem do cliente for APENAS uma saudação ou mensagem curta sem pedido ("oi", "olá", "bom dia", "boa tarde", "boa noite", "tudo bem?", "tá aí?", "ei", emoji solto, ou até 3 palavras sem pedido claro):
→ Cumprimente de volta com naturalidade e pergunte como pode ajudar. Base: "${greetingByHour}${contactName !== "não identificado" ? `, ${contactName}` : ""}! Como posso ajudar?" — mas VARIE a formulação a cada vez ("Tudo bem por aí? Me conta, o que você precisa?", "Que bom falar com você! Em que posso ajudar hoje?"). Nunca use exatamente a mesma frase da última saudação.
→ NÃO chame ferramenta nenhuma.
→ NÃO cite chamados em aberto, agendamentos, ativos, OS, visitas ou qualquer outro contexto.
→ ESPERE o cliente dizer o que quer.

Você TEM acesso a chamados, ativos, agenda e histórico do cliente abaixo. Esse contexto é REFERÊNCIA SILENCIOSA — só use quando o cliente PERGUNTAR especificamente sobre aquele item.

═══════════════════════════════════════
🛠️ FERRAMENTAS — SÓ COM PEDIDO EXPLÍCITO:
═══════════════════════════════════════
NUNCA execute uma ferramenta sem o cliente ter pedido explicitamente o que ela resolve.
- create_ticket: só após o cliente CONFIRMAR "pode abrir o chamado" (ou equivalente).
- create_schedule: só após o cliente pedir agendamento e confirmar data/hora.
- consultar_valor_visita: use para saber o valor certo da visita técnica — NUNCA informe preço de memória, sempre consulte aqui antes de falar valor pro cliente.
- confirmar_visita_eventual: OBRIGATÓRIO para cliente SEM contrato (eventual) antes de agendar. Só chame depois que o cliente confirmar EXPLICITAMENTE valor E data da visita — nunca supondo que ele concordou. Sem essa confirmação, create_ticket não agenda OS e create_schedule recusa direto.
- find_company / link_contact: só quando o cliente disser o nome da empresa ou pedir para ser identificado. NÃO infira.
- register_asset: só quando o cliente pedir para cadastrar um ativo.
- close_ticket: só quando o cliente pedir para encerrar.
- search_knowledge_base: pode usar livremente ANTES de responder dúvidas técnicas.
- escalate_to_human: quando o cliente pedir humano/técnico/Jose.
- partial_escalate: reclamação, desconto, renegociação, cancelamento, assunto financeiro/jurídico.

Em dúvida, faça UMA pergunta curta. Não chute.

═══════════════════════════════════════
✅ ANTES DE ENVIAR — AUTO-REVISÃO:
═══════════════════════════════════════
Reveja sua resposta antes de enviar:
1. Ela introduz algum assunto que o cliente NÃO pediu? → Apague essa parte.
2. Está longa demais para WhatsApp (mais de 3 frases sem necessidade)? → Enxugue.
3. Está seca, fria, ou soa como robô/atendimento automático? → Reescreva com calor humano.
4. Repete palavra por palavra uma frase que você já usou nesta conversa? → Reformule com outras palavras.
5. Cita chamado/agenda/ativo sem o cliente ter perguntado? → Apague.
6. É uma recusa? → Confira que agradece, explica o porquê com jeito e deixa a porta aberta.

═══════════════════════════════════════
🤝 EMPATIA:
═══════════════════════════════════════
- Quando o cliente relata um problema que o está atrapalhando, reconheça de forma genuína e curta e JÁ emende a ação ("Poxa, imagino o transtorno — vamos resolver isso. O computador liga e trava, ou nem liga?"). Nunca mande só a frase de empatia sozinha, sem encaminhamento.
- Agradecimentos: responda com carinho e variação ("Por nada, precisando é só chamar!", "Imagina, estamos aqui pra isso!", "Nós que agradecemos a confiança!").
- Empatia é tempero, não recheio: 1 frase no máximo, e não em toda mensagem.

⏰ HORÁRIO: ${businessHoursContext}

═══════════════════════════════════════
🎯 IDENTIFICAÇÃO DO CLIENTE:
═══════════════════════════════════════
EMPRESA: ${companyName}
CONTATO: ${contactName}
TIPO DE CONTRATO: ${contractType}
${contractType === "eventual" ? `
🔒 CLIENTE SEM CONTRATO — GATE DE VISITA OBRIGATÓRIO:
Antes de agendar (create_ticket com visita ou create_schedule), você PRECISA:
1. Chamar consultar_valor_visita e informar o valor da visita (inclui 2h de atendimento) pro cliente.
2. Esperar o cliente confirmar EXPLICITAMENTE que concorda com o valor E com a data proposta.
3. Só então chamar confirmar_visita_eventual com o valor e a data confirmados.
Sem isso, o agendamento é recusado automaticamente. Serviço extra descoberto na visita é orçamento à parte (solicitar_orcamento) — nunca incluído na visita padrão.` : ""}
${contractType === "contrato_manutencao" ? `
💰 CLIENTE COM CONTRATO — FINANCEIRO:
- Pergunta sobre vencimento, valor mensal ou horas restantes do contrato → chame consultar_contrato, NUNCA informe de memória.
- "Como eu pago?" → junte numa resposta só o dia de vencimento (via consultar_contrato) e a chave PIX/CNPJ (ver seção de dado sensível abaixo).
- Emissão de nota fiscal e status de pagamento são geridos pelo BomControle, fora daqui — se perguntarem se já está pago, diga que não tem essa informação e ofereça encaminhar pro José.
- Pedido de desconto, renegociação de valor/plano, ou cancelamento de contrato → SEMPRE escalate_to_department('financeiro', motivo). Nunca prometa, negocie ou decida nada financeiro sozinha.` : ""}
${companyId ? `COMPANY_ID: ${companyId}` : multipleCompanies.length > 1 ? `MÚLTIPLAS EMPRESAS ENCONTRADAS PARA ESTE CONTATO:
${multipleCompanies.map((c, i) => `${i + 1}. ${c.nome_fantasia} (ID: ${c.id})`).join("\n")}

INSTRUÇÃO: Pergunte imediatamente de forma educada sobre qual empresa o contato está entrando em contato:
"Olá! Vi que você está cadastrado em mais de uma empresa aqui conosco. Pode me dizer sobre qual empresa você está entrando em contato hoje?
${multipleCompanies.map((c, i) => `${i + 1}. ${c.nome_fantasia}`).join("\n")}
"
Quando o cliente responder, use link_contact com o company_id correspondente. Se ele JÁ respondeu qual empresa em mensagem anterior desta conversa, use link_contact direto e NÃO pergunte de novo.` : `EMPRESA NÃO IDENTIFICADA.${contactName !== "não identificado" ? ` Mas o NOME você já sabe: ${contactName}. Chame o cliente pelo nome e NUNCA pergunte quem ele é.` : ""}

🚫 REGRA ANTI-INTERROGATÓRIO (CRÍTICA — clientes reclamam disso):
- ANTES de perguntar qualquer identificação, OLHE O HISTÓRICO da conversa. Se você já perguntou nome/empresa, ou o cliente já respondeu, é PROIBIDO perguntar de novo — use o que ele disse (find_company + link_contact) ou siga sem.
- Só pergunte a empresa se realmente PRECISAR dela (abrir chamado, agendar, orçamento). Dúvida técnica simples não exige identificação.
- Quando precisar, pergunte UMA única vez, com jeito: ${contactName !== "não identificado" ? `"Só me confirma, ${contactName}: de qual empresa você está falando?"` : `"Pra eu te atender direitinho, me diz seu nome e de qual empresa você fala?"`}
- Se não responder ou não souber, siga ajudando normalmente, sem insistir e sem repetir a pergunta. O José já foi avisado automaticamente para cadastrar este contato — você não precisa resolver o cadastro com o cliente.
- Se responder e find_company não achar: "Não achei o cadastro dessa empresa aqui, mas posso seguir te ajudando." NUNCA cadastre empresas automaticamente.`}
${assetTagSection}

═══════════════════════════════════════
CAPACIDADES (use só quando pedido):
═══════════════════════════════════════
Responder dúvidas técnicas, abrir/fechar/consultar chamados, listar ativos, comentar em chamados, informar visitas, escalonar para técnico, consultar/criar agendamento.

═══════════════════════════════════════
BASE DE CONHECIMENTO (use livremente para responder dúvidas técnicas):
═══════════════════════════════════════
${articlesText || "Nenhum artigo encontrado. Use search_knowledge_base para buscar."}

═══════════════════════════════════════
[REFERÊNCIA SILENCIOSA — NÃO CITE SEM O CLIENTE PERGUNTAR]
CHAMADOS ABERTOS DESTE CLIENTE:
═══════════════════════════════════════
${ticketsText || "Nenhum chamado aberto."}

═══════════════════════════════════════
[REFERÊNCIA SILENCIOSA — NÃO CITE SEM O CLIENTE PERGUNTAR]
ATIVOS DA EMPRESA:
═══════════════════════════════════════
${assetsText || "Nenhum ativo cadastrado."}

═══════════════════════════════════════
[REFERÊNCIA SILENCIOSA — NÃO CITE SEM O CLIENTE PERGUNTAR]
HISTÓRICO DE ATENDIMENTOS RECENTES:
═══════════════════════════════════════
${servicesText || "Sem atendimentos recentes."}

═══════════════════════════════════════
[REFERÊNCIA SILENCIOSA — NÃO CITE SEM O CLIENTE PERGUNTAR]
VISITAS AGENDADAS:
═══════════════════════════════════════
${visitsText || "Nenhuma visita agendada."}

═══════════════════════════════════════
[REFERÊNCIA SILENCIOSA — NÃO CITE SEM O CLIENTE PERGUNTAR]
AGENDA DE HOJE:
═══════════════════════════════════════
${(context.todayAgenda || []).length > 0
  ? (context.todayAgenda || []).map((a: any) => `${a.hora} - ${a.descricao} (${a.status}, ${a.prioridade})`).join("\n")
  : "Nenhum compromisso agendado para hoje."}

═══════════════════════════════════════
REGRAS DURAS:
═══════════════════════════════════════
- SEMPRE responda à ÚLTIMA mensagem do cliente. Ignore contexto antigo que contradiga.
- Se EMPRESA e CONTATO estão identificados acima, o cliente é conhecido: trate pelo nome e NUNCA pergunte quem ele é ou de que empresa fala.
- NUNCA repita uma pergunta que já foi feita nesta conversa (identificação ou qualquer outra).
- Use search_knowledge_base ANTES de responder dúvidas técnicas.
- NUNCA crie chamado, agendamento, vínculo ou cadastro sem confirmação explícita do cliente.
- NUNCA escreva JSON no texto. Use exclusivamente tool_calls estruturado.
- Use o nome "${contactName}" como solicitante ao criar chamados.

═══════════════════════════════════════
🖼️ IMAGENS ENVIADAS PELO CLIENTE:
═══════════════════════════════════════
Quando o cliente enviar uma FOTO (tela de erro, equipamento, cabo, etiqueta de patrimônio, número de série), ANALISE a imagem e:
- Descreva o que vê de forma útil e diagnostique o problema quando possível.
- Se for uma mensagem/código de erro, leia o texto da tela e explique.
- Se ajudar a resolver, busque na base de conhecimento (search_knowledge_base) com base no que viu.
- Se for um problema que exige atendimento, ofereça abrir chamado (com confirmação) já descrevendo o que a foto mostra.
- Nunca invente o que não dá pra ver. Se a imagem estiver ruim/cortada, peça uma nova foto.

═══════════════════════════════════════
🧾 ORÇAMENTOS:
═══════════════════════════════════════
${context.pendingOrcamento
  ? `⚠️ Este cliente tem um ORÇAMENTO PENDENTE: #${context.pendingOrcamento.numero}, total R$ ${Number(context.pendingOrcamento.valor_total || 0).toFixed(2)}, válido até ${context.pendingOrcamento.validade || "—"}.`
  : "Nenhum orçamento pendente para este cliente."}

- Se HÁ orçamento pendente e o cliente APROVA (ex.: "1", "aprovo", "aprovado", "pode fechar", "fechado", "aceito") → chame responder_orcamento com decisao="aprovado". Depois confirme: "Orçamento aprovado! O técnico já foi avisado e dará sequência."
- Se HÁ orçamento pendente e o cliente RECUSA (ex.: "2", "não", "muito caro", "não quero") → chame responder_orcamento com decisao="recusado" (capture o motivo em observacao, se houver).
- Se o cliente PEDE preço/cotação/orçamento de um serviço ou produto → NUNCA invente valores. Chame solicitar_orcamento com um resumo do que ele quer, e diga: "Já registrei seu pedido e o técnico vai preparar o orçamento e te enviar."
- NÃO use responder_orcamento se não houver orçamento pendente.

═══════════════════════════════════════
💰 CHAVE PIX / CNPJ (DADO SENSÍVEL):
═══════════════════════════════════════
Chave Pix = CNPJ 06.906.723/0001-30.

✅ SÓ envie quando o cliente PEDIR EXPLICITAMENTE chave Pix ou dados de pagamento ("me passa o pix", "qual o pix", "quero pagar via pix", "como pago?", "manda os dados pra pagamento").

❌ NUNCA envie se "pix" aparecer em outro contexto:
- "o pix não caiu", "pix fora do ar", "recebi um pix estranho" → problema técnico, ajude SEM mandar o CNPJ.
- "vocês aceitam pix?" → "Sim, aceitamos." Só envie CNPJ depois de confirmação clara.

Em dúvida, confirme: "Você quer fazer um pagamento? Posso te passar a chave." Só envia depois do sim.

═══════════════════════════════════════
⚠️ FALAR COM TÉCNICO:
═══════════════════════════════════════
Cliente pede "falar com técnico", "falar com Jose", "humano", "atendente", "transferir", responde "4", ou variação clara → chame escalate_to_human IMEDIATAMENTE com conversation_id, reason e resumo. Depois informe: "Transferido para o técnico Jose Pereira. Ele receberá o aviso e retornará em breve."

═══════════════════════════════════════
🔔 partial_escalate:
═══════════════════════════════════════
Use quando: reclamação/insatisfação, pedido de desconto/renegociação/cancelamento, assunto financeiro/comercial/jurídico, ou cliente pergunta especificamente quando o Jose vai atender.

═══════════════════════════════════════
🙋 MENSAGEM DIRIGIDA AO TÉCNICO (NÃO É PRA VOCÊ):
═══════════════════════════════════════
Se a mensagem do cliente é claramente dirigida ao José/Pereira pessoalmente — cita o nome dele ("Pereira", "José", "Zé"), comenta algo que ele estava fazendo agora há pouco (acesso remoto, visita, conversa em andamento), ou responde a uma mensagem que ele mandou — NÃO responda o assunto no lugar dele e NUNCA dê dica genérica nessa situação.
→ Chame partial_escalate com o resumo do que o cliente disse.
→ Responda apenas algo curto e natural avisando que ele vai retornar, ex.: "Vou passar seu recado pro José, ele já te responde!" (varie as palavras).

═══════════════════════════════════════
📅 AGENDAMENTOS:
═══════════════════════════════════════
- create_ticket/create_schedule NÃO criam mais uma visita definitiva sozinhos — só registram um horário candidato e notificam o José, que confirma manualmente.
- NUNCA diga "confirmado"/"agendado" pro cliente depois de chamar essas ferramentas — diga que o horário é candidato e a equipe vai confirmar em breve (ex.: "Consigo um horário provável segunda de manhã, vou confirmar com a equipe e já te aviso!").
- Mudança/cancelamento de agendamento existente → partial_escalate.

═══════════════════════════════════════
🏢 DEPARTAMENTO ATUAL: ${(context.departamento || "triagem").toUpperCase()}
═══════════════════════════════════════
${
  (context.departmentKnowledge || []).length > 0
    ? `Conhecimento aprovado para este departamento:\n${(context.departmentKnowledge || [])
        .map((k: any) => `• [${k.secao}] ${k.conteudo}`)
        .join("\n")}`
    : "Nenhum conhecimento específico aprovado para este departamento ainda."
}

- Se a conversa claramente pertence a outro departamento (ex.: assunto de contrato/cobrança → financeiro; publicidade/novidade → comercial; satisfação/reclamação recorrente → qualidade; suporte técnico/chamado/agenda → operacional), chame escalate_to_department(departamento, motivo) UMA vez. Isso muda o departamento da conversa e avisa o José — não fica repetindo a cada mensagem.
- Se perceber um padrão que deveria virar regra oficial da empresa (ex.: preço, política, algo que José sempre faz de um jeito específico) e ainda não está no conhecimento aprovado acima, chame propose_new_rule — NUNCA trate como regra só porque você "percebeu" o padrão. Só vira regra depois que o José aprovar na tela dele.
- Se identificar uma oportunidade comercial genuína NESTA conversa (cliente perguntou sobre outro serviço, ensejo natural de contar uma novidade relevante), chame propose_commercial_message — isso só registra a sugestão pro José revisar e decidir se manda; NUNCA prometa ao cliente que vai mandar algo, e NUNCA use isso pra iniciar assunto comercial fora de uma conversa que o próprio cliente começou.`;
}

// ─── Tools Definition (Expanded) ─────────────────────────────────────

function getTools() {
  return [
    {
      type: "function",
      function: {
        name: "create_ticket",
        description: "Cria um novo chamado de suporte. SOMENTE use após confirmação explícita do cliente.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título resumido do problema" },
            descricao: { type: "string", description: "Descrição detalhada do problema" },
            company_id: { type: "string", description: "UUID da empresa do cliente" },
            urgencia: { type: "string", enum: ["baixa", "media", "alta"], description: "Nível de urgência" },
            impacto: { type: "string", enum: ["baixo", "medio", "alto"], description: "Nível de impacto" },
            asset_id: { type: "string", description: "UUID do ativo relacionado (opcional)" },
          },
          required: ["titulo", "descricao", "company_id", "urgencia", "impacto"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_ticket_status",
        description: "Consulta o status de um chamado pelo número",
        parameters: {
          type: "object",
          properties: {
            numero: { type: "number", description: "Número do chamado" },
          },
          required: ["numero"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge_base",
        description: "Busca na base de conhecimento e nos tutoriais da wiki liberados para cliente. Use proativamente antes de responder dúvidas técnicas. O campo 'wiki' do resultado traz tutoriais já revisados pela equipe — prefira o conteúdo deles quando bater com a dúvida.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Palavras-chave para buscar (ex: 'impressora não imprime', 'VPN erro')" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_company_assets",
        description: "Lista os ativos (equipamentos) da empresa do cliente, com filtro opcional por tipo ou status",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID da empresa" },
            tipo: { type: "string", description: "Filtrar por tipo (desktop, notebook, impressora, servidor, etc.)" },
            estado: { type: "string", description: "Filtrar por estado (em_uso, estoque, manutencao, baixado)" },
          },
          required: ["company_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_ticket_comment",
        description: "Adiciona um comentário a um chamado existente para follow-up ou atualização",
        parameters: {
          type: "object",
          properties: {
            ticket_numero: { type: "number", description: "Número do chamado" },
            comentario: { type: "string", description: "Comentário a adicionar" },
          },
          required: ["ticket_numero", "comentario"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "schedule_visit",
        description: "Solicita agendamento de visita técnica para a empresa",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID da empresa" },
            motivo: { type: "string", description: "Motivo da visita" },
            data_sugerida: { type: "string", description: "Data sugerida no formato YYYY-MM-DD" },
          },
          required: ["company_id", "motivo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "escalate_to_human",
        description: "Transfere COMPLETAMENTE a conversa para um técnico humano. A IA deixa de responder.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Motivo da escalação" },
            conversation_id: { type: "string", description: "ID da conversa" },
            resumo: { type: "string", description: "Resumo estruturado: problema, tentativas, classificação de urgência" },
          },
          required: ["reason", "conversation_id", "resumo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "partial_escalate",
        description: "Notifica um técnico sobre o problema mas mantém a IA ativa como copiloto. Use para problemas que precisam atenção humana mas não requerem transferência imediata.",
        parameters: {
          type: "object",
          properties: {
            conversation_id: { type: "string", description: "ID da conversa" },
            reason: { type: "string", description: "Motivo da notificação" },
            resumo: { type: "string", description: "Resumo do problema: contexto, diagnóstico, tentativas, classificação" },
            urgencia: { type: "string", enum: ["baixa", "media", "alta"], description: "Urgência da atenção humana" },
          },
          required: ["conversation_id", "reason", "resumo", "urgencia"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "resolve_conversation",
        description: "Marca a conversa como resolvida quando o problema do cliente foi solucionado",
        parameters: {
          type: "object",
          properties: {
            conversation_id: { type: "string", description: "ID da conversa" },
          },
          required: ["conversation_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "close_ticket",
        description: "Fecha/resolve um chamado quando o cliente confirma que o problema foi solucionado. Atualiza o status para 'resolvido' e registra a solução.",
        parameters: {
          type: "object",
          properties: {
            ticket_numero: { type: "number", description: "Número do chamado a ser fechado" },
            solucao: { type: "string", description: "Descrição da solução aplicada ou confirmação do cliente" },
          },
          required: ["ticket_numero", "solucao"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_company",
        description: "Busca uma empresa cadastrada pelo nome. Use quando o contato não está vinculado a uma empresa e informou o nome dela.",
        parameters: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome da empresa informado pelo cliente (busca parcial)" },
          },
          required: ["nome"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "link_contact",
        description: "Vincula o contato atual a uma empresa existente. Use após encontrar a empresa com find_company.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID da empresa encontrada" },
            contact_name: { type: "string", description: "Nome do contato informado pelo cliente" },
          },
          required: ["company_id"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "register_asset",
        description: "Cadastra um novo ativo (equipamento) para a empresa do cliente. Use quando o cliente menciona um equipamento que não está cadastrado no sistema. Pergunte informações básicas como nome/identificação, tipo e modelo.",
        parameters: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID da empresa dona do equipamento" },
            nome: { type: "string", description: "Nome ou identificação do equipamento (ex: 'Notebook do João', 'Impressora Recepção')" },
            tipo: { type: "string", enum: ["desktop", "notebook", "servidor", "impressora", "monitor", "roteador", "switch", "modem", "camera", "dvr", "outro"], description: "Tipo do equipamento" },
            fabricante: { type: "string", description: "Fabricante (ex: Dell, HP, Lenovo) - opcional" },
            modelo: { type: "string", description: "Modelo do equipamento - opcional" },
            numero_serie: { type: "string", description: "Número de série - opcional" },
            setor: { type: "string", description: "Setor onde o equipamento fica (ex: Recepção, TI, Financeiro) - opcional" },
          },
          required: ["company_id", "nome", "tipo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_agenda",
        description: "Consulta a agenda de compromissos (OS, tickets, visitas) para uma data específica. Se não informar data, usa hoje.",
        parameters: {
          type: "object",
          properties: {
            data: { type: "string", description: "Data no formato YYYY-MM-DD (opcional, padrão: hoje)" },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_schedule",
        description: "Registra um PEDIDO de agendamento com um horário candidato (usando o Smart Scheduler) e notifica o José. NÃO cria uma visita definitiva — a confirmação final é manual. Nunca diga ao cliente que está confirmado.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título do agendamento" },
            descricao: { type: "string", description: "Descrição do que será feito" },
            data: { type: "string", description: "Data desejada no formato YYYY-MM-DD" },
            company_id: { type: "string", description: "UUID da empresa (opcional)" },
            tipo_servico: { type: "string", description: "Tipo: preventivo, corretivo, instalacao, outro" },
          },
          required: ["titulo", "descricao", "data"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "responder_orcamento",
        description: "Registra a decisão do cliente sobre um orçamento PENDENTE. Use SOMENTE quando há orçamento pendente e o cliente aprova (ex.: '1', 'aprovo', 'aprovado', 'pode fechar') ou recusa (ex.: '2', 'não', 'muito caro', 'recusar').",
        parameters: {
          type: "object",
          properties: {
            decisao: { type: "string", enum: ["aprovado", "recusado"], description: "Decisão do cliente sobre o orçamento" },
            orcamento_numero: { type: "number", description: "Número do orçamento (opcional; se omitido usa o pendente mais recente da empresa)" },
            observacao: { type: "string", description: "Observação do cliente, ex.: motivo da recusa (opcional)" },
          },
          required: ["decisao"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "solicitar_orcamento",
        description: "Registra um PEDIDO de cotação/orçamento do cliente e notifica o técnico para preparar. Use quando o cliente pede preço/cotação/orçamento de serviço ou produto. NUNCA invente preços — apenas registre o pedido.",
        parameters: {
          type: "object",
          properties: {
            resumo: { type: "string", description: "Resumo do que o cliente quer orçar (serviço/produto, equipamento, contexto relevante)" },
          },
          required: ["resumo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "escalate_to_department",
        description: "Encaminha a conversa pra outro departamento da empresa (financeiro, operacional, comercial ou qualidade) quando o assunto claramente pertence a ele. Use no máximo 1x por assunto — não repita a cada mensagem.",
        parameters: {
          type: "object",
          properties: {
            departamento: { type: "string", enum: ["financeiro", "operacional", "comercial", "qualidade"], description: "Departamento de destino" },
            motivo: { type: "string", description: "Por que essa conversa pertence a esse departamento" },
          },
          required: ["departamento", "motivo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_new_rule",
        description: "Sugere uma regra, preço ou atualização de conhecimento nova pra diretoria (José) revisar. NUNCA vira regra oficial sozinho — só registra a sugestão. Use quando perceber um padrão recorrente que ainda não está documentado.",
        parameters: {
          type: "object",
          properties: {
            departamento: { type: "string", enum: ["financeiro", "operacional", "comercial", "qualidade"], description: "Departamento a que a regra pertence" },
            titulo: { type: "string", description: "Título curto da sugestão" },
            justificativa: { type: "string", description: "Por que está sugerindo isso (o que foi observado)" },
            conteudo_proposto: { type: "string", description: "O texto da regra/conhecimento sugerido, pronto pra virar documentação se aprovado" },
          },
          required: ["departamento", "titulo", "justificativa", "conteudo_proposto"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_commercial_message",
        description: "Sugere uma mensagem comercial (novidade, cross-sell, oferta) pra ESTE cliente específico, quando surgir uma oportunidade genuína na conversa. NUNCA envia nada — só registra a sugestão pro José revisar destinatário e texto e decidir se manda. Use no máximo 1x por assunto.",
        parameters: {
          type: "object",
          properties: {
            conteudo_proposto: { type: "string", description: "Texto da mensagem comercial sugerida" },
            motivo: { type: "string", description: "Por que essa mensagem faz sentido pra este cliente agora" },
          },
          required: ["conteudo_proposto", "motivo"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "consultar_valor_visita",
        description: "Consulta o valor atual da visita técnica e quantas horas de atendimento ela inclui. Use SEMPRE antes de informar o preço da visita a um cliente sem contrato — NUNCA informe de memória, o valor pode mudar.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "confirmar_visita_eventual",
        description: "Registra a confirmação EXPLÍCITA do cliente sobre valor e data da visita técnica (cliente sem contrato). SÓ chame depois que o cliente confirmar claramente as duas coisas — nunca antes, nunca supondo. É obrigatório antes de create_schedule funcionar para cliente eventual.",
        parameters: {
          type: "object",
          properties: {
            valor: { type: "number", description: "Valor da visita que o cliente confirmou (deve bater com o valor de consultar_valor_visita)" },
            data_visita: { type: "string", description: "Data confirmada no formato YYYY-MM-DD" },
            resumo_acordado: { type: "string", description: "Resumo curto do que foi combinado" },
          },
          required: ["valor", "data_visita", "resumo_acordado"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "consultar_contrato",
        description: "Consulta o contrato ATIVO da empresa do cliente (status, horas contratadas/consumidas/restantes, vencimento, valor mensal). Use SEMPRE que o cliente perguntar sobre vencimento, valor ou horas do contrato — NUNCA informe de memória. Se o cliente não tiver contrato ativo, a ferramenta avisa e você explica isso normalmente.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ];
}

// ─── Tool Execution (Expanded) ───────────────────────────────────────

async function handleToolCalls(supabase: any, toolCalls: any[], phone: string, conversationId: string, context: any) {
  const results = [];

  for (const call of toolCalls) {
    const args = JSON.parse(call.function.arguments);
    let result: any;

    switch (call.function.name) {
      case "create_ticket": {
        const contactName = context.contact?.contact_name || phone;
        const TECNICO_PHONE = "5562999522470"; // José — notificação de admin, sempre recebe

        // ─── Trava anti-duplicidade ──────────────────────────────────
        // Execuções paralelas (cliente fragmentando mensagens) e rounds
        // seguidos do modelo abriam chamados repetidos (caso Hiper Cristal
        // 07/07/26: 6 chamados em 3 min). Se este mesmo contato já tem
        // chamado não-resolvido aberto via WhatsApp nos últimos 30 min,
        // NÃO cria outro: registra o pedido como comentário no existente.
        const dupSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentTicket } = await supabase
          .from("tickets")
          .select("id, numero, titulo, tecnico_id")
          .eq("canal", "whatsapp")
          .eq("solicitante_contato", phone)
          .gte("created_at", dupSince)
          .not("status", "in", "(resolvido,fechado)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentTicket) {
          await supabase.from("ticket_comments").insert({
            ticket_id: recentTicket.id,
            user_id: recentTicket.tecnico_id,
            comentario: `[Via WhatsApp IA] Pedido adicional do cliente na mesma conversa: ${args.titulo} — ${args.descricao}`,
            is_internal: true,
          });
          result = {
            success: true,
            duplicado: true,
            numero: recentTicket.numero,
            aviso: `JÁ EXISTE o chamado #${recentTicket.numero} aberto há menos de 30 minutos para este cliente ("${recentTicket.titulo}"). Nenhum chamado novo foi criado — o pedido foi registrado como atualização no chamado existente. Informe o cliente que a solicitação está registrada no chamado #${recentTicket.numero} e NÃO tente criar outro chamado.`,
          };
          console.log(`create_ticket dedupe: reused #${recentTicket.numero} for ${phone}`);
          break;
        }

        // Fase 1 — técnico único (José) deixou de ser hardcoded: escolhe
        // dinamicamente entre todos os técnicos ativos por menor carga.
        const tecnico = await pickTechnician(supabase);

        const { data: ticket, error } = await supabase
          .from("tickets")
          .insert({
            titulo: args.titulo,
            descricao: args.descricao,
            company_id: args.company_id,
            canal: "whatsapp",
            status: "em_atendimento",
            urgencia: args.urgencia || "media",
            impacto: args.impacto || "medio",
            asset_id: args.asset_id || null,
            solicitante_nome: contactName,
            solicitante_contato: phone,
            tecnico_id: tecnico.id,
            public_request: true,
          })
          .select("numero, id")
          .single();

        if (error) {
          console.error("Error creating ticket:", error);
          result = { success: false, error: error.message };
        } else {
          result = { success: true, numero: ticket.numero, id: ticket.id };
          console.log(`Ticket #${ticket.numero} created and assigned to ${tecnico.nome}`);

          // ─── TRAVA (28/07/2026): a Miya NÃO cria mais OS sozinha, nem
          // pra cliente eventual nem pra cliente com contrato — José pediu
          // depois de um caso real onde a empresa/endereço ficou ambíguo e
          // ela agendou mesmo assim. Agora ela só PROPÕE (agent_proposals,
          // tipo agendamento_visita) e a OS de verdade só nasce quando o
          // José aprova + aplica na tela de Propostas dos Agentes.
          const tipoContrato = context.assetFromTag?.companies?.tipo_contrato || context.contact?.companies?.tipo_contrato || null;
          let osInfo = "";

          if (tipoContrato === "eventual") {
            const confirmacaoValida = await getVisitaEventualConfirmacaoValida(supabase, conversationId);
            if (!confirmacaoValida) {
              result.aviso_agendamento = "Cliente sem contrato: ainda não há confirmação válida de valor e data da visita. Chame consultar_valor_visita e, depois que o cliente confirmar, confirmar_visita_eventual antes de seguir.";
            }
          }
          try {
            const preview = await previewSchedule(supabase, {
              company_id: args.company_id,
              titulo: args.titulo,
              descricao: args.descricao,
              urgencia: args.urgencia,
              data_desejada: undefined,
              tecnico_preescolhido: tecnico,
            });
            if (preview.success) {
              const companyNameProp = context.contact?.companies?.nome_fantasia || "empresa não identificada";
              await supabase.from("agent_proposals").insert({
                departamento: "operacional",
                tipo_proposta: "agendamento_visita",
                titulo: `Agendamento — ${companyNameProp}`,
                justificativa: `Cliente pediu via chamado #${ticket.numero}: ${args.titulo}`,
                conteudo_proposto: args.descricao,
                destinatario_phone: phone,
                destinatario_company_id: args.company_id || null,
                dados_estruturados: {
                  ticket_id: ticket.id,
                  urgencia: args.urgencia,
                  data_desejada: preview.data,
                  hora_inicio: preview.hora_inicio,
                  hora_fim: preview.hora_fim,
                  modalidade: preview.modalidade,
                  tecnico_id: preview.tecnico?.id,
                  tecnico_nome: preview.tecnico?.nome,
                },
                created_by_agent: "waba-ai-agent",
              });
              osInfo = `\n📅 Horário candidato (AGUARDANDO SUA APROVAÇÃO em /agent-proposals): ${preview.data} ${preview.hora_inicio}-${preview.hora_fim} (${preview.modalidade}), técnico sugerido ${preview.tecnico?.nome}`;
              result.horario_candidato = `${preview.data} ${preview.hora_inicio}-${preview.hora_fim} (${preview.modalidade})`;
              result.aviso_agendamento = (result.aviso_agendamento ? result.aviso_agendamento + " " : "") +
                "Pedido de agendamento registrado — informe ao cliente que o horário ainda depende de confirmação da equipe, não prometa como definitivo.";
            }
          } catch (schedErr) {
            console.error("previewSchedule/proposal error (non-fatal):", schedErr);
          }

          // Notify technician via WhatsApp — José sempre recebe (dono do
          // negócio); se o técnico atribuído for outra pessoa, notifica
          // ele também, senão o novo técnico nunca fica sabendo da OS.
          try {
            const companyName = context.contact?.companies?.nome_fantasia || "Empresa não identificada";
            const notifMsg = `🔔 *Novo Chamado #${ticket.numero}*\n\n` +
              `📋 *Título:* ${args.titulo}\n` +
              `🏢 *Empresa:* ${companyName}\n` +
              `👤 *Solicitante:* ${contactName}\n` +
              `📞 *Contato:* ${phone}\n` +
              `⚡ *Urgência:* ${args.urgencia || "media"}\n` +
              `💥 *Impacto:* ${args.impacto || "medio"}\n` +
              `🔧 *Técnico atribuído:* ${tecnico.nome}\n\n` +
              `📝 *Descrição:*\n${args.descricao}${osInfo}\n\n` +
              `${args.asset_id ? `🖥️ *Ativo vinculado:* Sim` : `🖥️ *Ativo:* Não vinculado`}`;

            await sendWabaText(TECNICO_PHONE, notifMsg, { openTicket: false });
            console.log(`WhatsApp notification sent to technician ${TECNICO_PHONE}`);

            if (tecnico.id !== JOSE_TECNICO_ID) {
              const { data: tecProfile } = await supabase.from("profiles").select("telefone").eq("id", tecnico.id).maybeSingle();
              if (tecProfile?.telefone) {
                await sendWabaText(tecProfile.telefone, notifMsg, { openTicket: false });
              }
            }
          } catch (notifErr) {
            console.error("Failed to notify technician:", notifErr);
          }
        }
        break;
      }

      case "check_ticket_status": {
        const { data: ticket } = await supabase
          .from("tickets")
          .select("numero, titulo, status, prioridade, created_at, tecnico_id, profiles:tecnico_id(nome)")
          .eq("numero", args.numero)
          .maybeSingle();

        if (ticket) {
          result = {
            found: true,
            numero: ticket.numero,
            titulo: ticket.titulo,
            status: ticket.status,
            prioridade: ticket.prioridade,
            criado_em: ticket.created_at,
            tecnico: ticket.profiles?.nome || "não atribuído",
          };
        } else {
          result = { found: false };
        }
        break;
      }

      case "search_knowledge_base": {
        let articles: any[] = [];
        let paginasWiki: any[] = [];

        // 1) Busca semântica (embedding da pergunta → similaridade por cosseno)
        try {
          const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
          if (OPENAI_API_KEY) {
            const embResp = await fetch("https://api.openai.com/v1/embeddings", {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: "text-embedding-3-small", input: args.query }),
            });
            if (embResp.ok) {
              const embJson = await embResp.json();
              const queryEmbedding = embJson.data[0].embedding;
              const { data: matches, error: matchErr } = await supabase.rpc("match_knowledge_articles", {
                query_embedding: queryEmbedding,
                match_count: 5,
                match_threshold: 0.2,
              });
              if (!matchErr && matches?.length) articles = matches;

              // Wiki interna (BookStack). ⚠️ p_somente_cliente: true é
              // OBRIGATÓRIO aqui — a Miya conversa com CLIENTE no WhatsApp, e a
              // wiki é documentação interna. Só passa página que o José marcou
              // com a tag "cliente" no BookStack. Não remover essa trava.
              const { data: wiki, error: wikiErr } = await supabase.rpc("match_wiki_pages", {
                query_embedding: queryEmbedding,
                match_count: 3,
                match_threshold: 0.3,
                p_somente_cliente: true,
              });
              if (!wikiErr && wiki?.length) paginasWiki = wiki;
            }
          }
        } catch (e: any) {
          console.error("Busca semântica falhou, caindo para keyword:", e.message);
        }

        // 2) Fallback: busca por palavra-chave (ilike)
        if (!articles.length) {
          const searchTerms = args.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
          if (searchTerms.length) {
            const orConditions = searchTerms
              .map((t: string) => `problema.ilike.%${t}%,solucao.ilike.%${t}%,titulo.ilike.%${t}%`)
              .join(",");
            const { data: kw } = await supabase
              .from("knowledge_articles")
              .select("titulo, problema, solucao, categoria, tags")
              .or(orConditions)
              .order("util_count", { ascending: false })
              .limit(5);
            articles = kw || [];
          }
        }

        result = {
          found: articles.length,
          // mascararCredenciais: ver comentário na definição — artigo gerado por
          // IA já trouxe senha de cliente em texto puro.
          articles: articles.map((a: any) => ({
            titulo: a.titulo,
            problema: mascararCredenciais(a.problema),
            solucao: mascararCredenciais(a.solucao),
            categoria: a.categoria,
            ...(a.similarity != null ? { relevancia: Math.round(a.similarity * 100) / 100 } : {}),
          })),
          // Páginas da wiki liberadas para cliente (tag "cliente" no BookStack).
          wiki: paginasWiki.map((p: any) => ({
            titulo: p.titulo,
            conteudo: mascararCredenciais(String(p.conteudo ?? "").slice(0, 1500)),
            relevancia: Math.round((p.similarity ?? 0) * 100) / 100,
          })),
        };
        break;
      }

      case "list_company_assets": {
        let query = supabase
          .from("assets")
          .select("id, nome, tipo, estado, fabricante, modelo, setor, local, numero_serie")
          .eq("company_id", args.company_id);

        if (args.tipo) query = query.eq("tipo", args.tipo);
        if (args.estado) query = query.eq("estado", args.estado);

        const { data: assets } = await query.order("nome").limit(20);

        result = {
          total: (assets || []).length,
          assets: (assets || []).map((a: any) => ({
            id: a.id,
            nome: a.nome,
            tipo: a.tipo,
            estado: a.estado,
            fabricante: a.fabricante,
            modelo: a.modelo,
            setor: a.setor,
            local: a.local,
          })),
        };
        break;
      }

      case "add_ticket_comment": {
        // Find ticket by number
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id")
          .eq("numero", args.ticket_numero)
          .maybeSingle();

        if (!ticket) {
          result = { success: false, error: "Chamado não encontrado" };
        } else {
          const TECNICO_ID_COMMENT = "e336e78e-c11a-48b5-8d69-2bb48cf6bb3b";
          const { error } = await supabase
            .from("ticket_comments")
            .insert({
              ticket_id: ticket.id,
              user_id: TECNICO_ID_COMMENT,
              comentario: `[Via WhatsApp IA] ${args.comentario}`,
              is_internal: true,
            });

          if (error) {
            console.error("Error adding comment:", error);
            result = { success: false, error: error.message };
          } else {
            result = { success: true };
          }
        }
        break;
      }

      case "close_ticket": {
        const { data: ticketToClose } = await supabase
          .from("tickets")
          .select("id, numero, status")
          .eq("numero", args.ticket_numero)
          .maybeSingle();

        if (!ticketToClose) {
          result = { success: false, error: "Chamado não encontrado" };
        } else if (ticketToClose.status === "resolvido" || ticketToClose.status === "fechado") {
          result = { success: true, message: "Chamado já estava resolvido/fechado" };
        } else {
          const { error: updateError } = await supabase
            .from("tickets")
            .update({
              status: "resolvido",
              solucao: args.solucao,
              data_solucao: new Date().toISOString(),
            })
            .eq("id", ticketToClose.id);

          if (updateError) {
            console.error("Error closing ticket:", updateError);
            result = { success: false, error: updateError.message };
          } else {
            // Add closing comment
            const TECNICO_ID_CLOSE = "e336e78e-c11a-48b5-8d69-2bb48cf6bb3b";
            await supabase.from("ticket_comments").insert({
              ticket_id: ticketToClose.id,
              user_id: TECNICO_ID_CLOSE,
              comentario: `[Via WhatsApp IA] Chamado encerrado a pedido do cliente. Solução: ${args.solucao}`,
              is_internal: true,
            });

            result = { success: true, numero: ticketToClose.numero, message: "Chamado resolvido com sucesso" };
            console.log(`Ticket #${ticketToClose.numero} closed via WhatsApp AI`);

            // Generate knowledge article
            try {
              await supabase.functions.invoke("ai-knowledge-generator", {
                body: { ticket_id: ticketToClose.id },
              });
            } catch (e) {
              console.error("Knowledge generation error:", e);
            }
          }
        }
        break;
      }

      case "schedule_visit": {
        const { data: visit, error } = await supabase
          .from("visit_schedules")
          .insert({
            company_id: args.company_id,
            motivo: "corretiva",
            prioridade: "media",
            proxima_visita: args.data_sugerida || new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
            observacoes: `Solicitado via WhatsApp: ${args.motivo}`,
            status: "pendente",
          })
          .select("id, proxima_visita")
          .single();

        if (error) {
          console.error("Error scheduling visit:", error);
          result = { success: false, error: error.message };
        } else {
          result = { success: true, data: visit.proxima_visita };
        }
        break;
      }

      case "escalate_to_human": {
        await supabase
          .from("waba_conversations")
          .update({ ai_enabled: false, queue_status: "waiting" })
          .eq("id", args.conversation_id);

        await supabase.from("waba_messages").insert({
          conversation_id: args.conversation_id,
          direction: "outbound",
          message_type: "system",
          content: `⚠️ Escalado para técnico: ${args.reason}\n\n📋 Resumo da IA:\n${args.resumo}`,
          status: "delivered",
          sender_type: "system",
        });

        // === NOTIFICAÇÕES AO ESCALONAR ===
        const escalateContactName = context.contact?.contact_name || phone;
        const escalateCompanyName = context.contact?.companies?.nome_fantasia || "Não identificada";

        // 1. Push notification para admins e técnicos
        try {
          const pushAuthKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
          const pushUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`;
          console.log(`Sending push notifications via: ${pushUrl}`);
          
          const adminPushRes = await fetch(pushUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${pushAuthKey}`,
            },
            body: JSON.stringify({
              role: "admin_provedor",
              title: "🔔 Cliente aguardando atendimento",
              body: `${escalateContactName} (${escalateCompanyName}) solicitou falar com um técnico`,
              data: { type: "escalation", conversation_id: args.conversation_id },
              tag: `escalation-${args.conversation_id}`,
            }),
          });
          const adminPushResult = await adminPushRes.text();
          console.log(`Push admin response (${adminPushRes.status}):`, adminPushResult.substring(0, 200));
          
          // Also notify technicians
          const techPushRes = await fetch(pushUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${pushAuthKey}`,
            },
            body: JSON.stringify({
              role: "tecnico",
              title: "🔔 Cliente aguardando atendimento",
              body: `${escalateContactName} (${escalateCompanyName}) solicitou falar com um técnico`,
              data: { type: "escalation", conversation_id: args.conversation_id },
              tag: `escalation-${args.conversation_id}`,
            }),
          });
          const techPushResult = await techPushRes.text();
          console.log(`Push tecnico response (${techPushRes.status}):`, techPushResult.substring(0, 200));
        } catch (pushErr) {
          console.error("Failed to send push notification for escalation:", pushErr);
        }

        // 2. WhatsApp notification para técnico via Mabbix
        try {
          const TECNICO_PHONE_ESCALATE = "5562999522470";
          const escalateMsg = `🚨 *Transferência de Atendimento*\n\n` +
            `👤 *Cliente:* ${escalateContactName}\n` +
            `📞 *Telefone:* ${phone}\n` +
            `🏢 *Empresa:* ${escalateCompanyName}\n\n` +
            `📋 *Motivo:* ${args.reason}\n\n` +
            `📝 *Resumo da IA:*\n${args.resumo}\n\n` +
            `⚡ Acesse a plataforma WhatsApp para atender este cliente.`;

          await sendWabaText(TECNICO_PHONE_ESCALATE, escalateMsg, { openTicket: false });
          console.log(`WhatsApp escalation notification sent to ${TECNICO_PHONE_ESCALATE}`);
        } catch (waMsgErr) {
          console.error("Failed to send WhatsApp escalation notification:", waMsgErr);
        }

        result = { success: true, reason: args.reason };
        console.log(`Conversation ${args.conversation_id} fully escalated: ${args.reason}`);
        break;
      }

      case "partial_escalate": {
        // Keep AI enabled but notify team
        await supabase
          .from("waba_conversations")
          .update({
            queue_status: "ai_copilot",
            ai_context: {
              escalation_reason: args.reason,
              resumo: args.resumo,
              urgencia: args.urgencia,
              escalated_at: new Date().toISOString(),
            },
          })
          .eq("id", args.conversation_id);

        await supabase.from("waba_messages").insert({
          conversation_id: args.conversation_id,
          direction: "outbound",
          message_type: "system",
          content: `📋 Notificação para equipe técnica (urgência: ${args.urgencia}):\n${args.reason}\n\nResumo: ${args.resumo}\n\n🤖 IA continua ativa como copiloto.`,
          status: "delivered",
          sender_type: "system",
        });

        // Push notification para equipe (partial escalate)
        const partialContactName = context.contact?.contact_name || phone;
        const partialCompanyName = context.contact?.companies?.nome_fantasia || "Não identificada";
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              role: "admin_provedor",
              title: `⚡ Atenção: ${args.urgencia?.toUpperCase() || "MEDIA"}`,
              body: `${partialContactName} (${partialCompanyName}): ${args.reason}`,
              data: { type: "partial_escalation", conversation_id: args.conversation_id },
              tag: `partial-escalation-${args.conversation_id}`,
            }),
          });
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              role: "tecnico",
              title: `⚡ Atenção: ${args.urgencia?.toUpperCase() || "MEDIA"}`,
              body: `${partialContactName} (${partialCompanyName}): ${args.reason}`,
              data: { type: "partial_escalation", conversation_id: args.conversation_id },
              tag: `partial-escalation-${args.conversation_id}`,
            }),
          });
          console.log("Push notifications sent for partial escalation");
        } catch (pushErr) {
          console.error("Failed to send push for partial escalation:", pushErr);
        }

        // WhatsApp notification to technician for partial escalation
        try {
          const TECNICO_PHONE_PARTIAL = "5562999522470";
          const partialMsg = `⚡ *Atenção — Atendimento IA (${args.urgencia?.toUpperCase() || "MEDIA"})*\n\n` +
            `👤 *Cliente:* ${partialContactName}\n` +
            `📞 *Telefone:* ${phone}\n` +
            `🏢 *Empresa:* ${partialCompanyName}\n\n` +
            `📋 *Motivo:* ${args.reason}\n\n` +
            `📝 *Resumo:*\n${args.resumo}\n\n` +
            `🤖 A IA continua ativa como copiloto. Acesse a plataforma se precisar intervir.`;

          await sendWabaText(TECNICO_PHONE_PARTIAL, partialMsg, { openTicket: false });
          console.log(`WhatsApp partial escalation notification sent to ${TECNICO_PHONE_PARTIAL}`);
        } catch (waMsgErr) {
          console.error("Failed to send WhatsApp partial escalation notification:", waMsgErr);
        }

        result = { success: true, mode: "ai_copilot", urgencia: args.urgencia };
        console.log(`Conversation ${args.conversation_id} partially escalated (copilot mode): ${args.reason}`);
        break;
      }

      case "resolve_conversation": {
        await supabase
          .from("waba_conversations")
          .update({ queue_status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", args.conversation_id);

        await supabase.from("waba_messages").insert({
          conversation_id: args.conversation_id,
          direction: "outbound",
          message_type: "system",
          content: "✅ Conversa resolvida pela IA",
          status: "delivered",
          sender_type: "system",
        });

        result = { success: true };
        console.log(`Conversation ${args.conversation_id} resolved by AI`);
        break;
      }

      case "find_company": {
        const searchName = args.nome.trim();
        const { data: companies } = await supabase
          .from("companies")
          .select("id, nome_fantasia, razao_social, cnpj, telefone, tipo_contrato")
          .or(`nome_fantasia.ilike.%${searchName}%,razao_social.ilike.%${searchName}%`)
          .eq("status", true)
          .limit(5);

        if (companies && companies.length > 0) {
          result = {
            found: true,
            total: companies.length,
            companies: companies.map((c: any) => ({
              id: c.id,
              nome_fantasia: c.nome_fantasia,
              razao_social: c.razao_social,
              cnpj: c.cnpj,
              tipo_contrato: c.tipo_contrato,
            })),
          };
        } else {
          result = { found: false, message: "Nenhuma empresa encontrada com esse nome." };
        }
        console.log(`find_company "${searchName}": ${(companies || []).length} results`);
        break;
      }

      case "link_contact": {
        // Update whatsapp_contacts with company_id
        const { error: linkError } = await supabase
          .from("whatsapp_contacts")
          .upsert({
            phone_number: phone,
            company_id: args.company_id,
            contact_name: args.contact_name || null,
            last_message_at: new Date().toISOString(),
          }, { onConflict: "phone_number" });

        if (linkError) {
          console.error("Error linking contact:", linkError);
          result = { success: false, error: linkError.message };
        } else {
          // Also update conversation contact_name
          await supabase
            .from("waba_conversations")
            .update({ contact_name: args.contact_name || null })
            .eq("id", conversationId);

          result = { success: true, company_id: args.company_id };
          console.log(`Contact ${phone} linked to company ${args.company_id}`);
        }
        break;
      }


      case "register_asset": {
        const { data: newAsset, error: assetError } = await supabase
          .from("assets")
          .insert({
            company_id: args.company_id,
            nome: args.nome,
            tipo: args.tipo,
            fabricante: args.fabricante || null,
            modelo: args.modelo || null,
            numero_serie: args.numero_serie || null,
            setor: args.setor || null,
            estado: "em_uso",
          })
          .select("id, nome, tipo")
          .single();

        if (assetError) {
          console.error("Error registering asset:", assetError);
          result = { success: false, error: assetError.message };
        } else {
          result = { success: true, asset_id: newAsset.id, nome: newAsset.nome, tipo: newAsset.tipo };
          console.log(`Asset "${newAsset.nome}" (${newAsset.tipo}) registered for company ${args.company_id}`);
        }
        break;
      }

      case "check_agenda": {
        const targetDate = args.data || new Date().toISOString().split("T")[0];
        const [osRes, visitRes, dailyRes] = await Promise.all([
          supabase
            .from("service_orders")
            .select("numero_os, descricao_servicos, hora_agendada, modalidade, tipo_servico, status, prioridade, companies:company_id(nome_fantasia)")
            .gte("data_agendada", `${targetDate}T00:00:00`)
            .lte("data_agendada", `${targetDate}T23:59:59`)
            .order("hora_agendada"),
          supabase
            .from("visit_schedules")
            .select("proxima_visita, motivo, prioridade, status, companies:company_id(nome_fantasia)")
            .eq("proxima_visita", targetDate),
          supabase
            .from("daily_service_records")
            .select("titulo, status, hora_inicio, canal, companies:company_id(nome_fantasia)")
            .eq("data_atendimento", targetDate),
        ]);

        result = {
          data: targetDate,
          os_agendadas: (osRes.data || []).map((o: any) => ({
            numero: o.numero_os,
            hora: o.hora_agendada?.substring(0, 5) || "--:--",
            empresa: o.companies?.nome_fantasia || "N/A",
            tipo: o.tipo_servico,
            modalidade: o.modalidade,
            status: o.status,
            descricao: o.descricao_servicos?.substring(0, 80),
          })),
          visitas: (visitRes.data || []).map((v: any) => ({
            empresa: v.companies?.nome_fantasia || "N/A",
            motivo: v.motivo,
            prioridade: v.prioridade,
            status: v.status,
          })),
          atendimentos: (dailyRes.data || []).map((d: any) => ({
            titulo: d.titulo,
            empresa: d.companies?.nome_fantasia || "N/A",
            hora: d.hora_inicio?.substring(0, 5),
            status: d.status,
          })),
          total: (osRes.data?.length || 0) + (visitRes.data?.length || 0) + (dailyRes.data?.length || 0),
        };
        console.log(`check_agenda for ${targetDate}: ${result.total} items`);
        break;
      }

      case "create_schedule": {
        try {
          const companyId = args.company_id || context.companyId || null;
          const tipoContrato = context.assetFromTag?.companies?.tipo_contrato || context.contact?.companies?.tipo_contrato || null;

          // Cliente sem contrato: create_schedule só funciona depois de uma
          // confirmação explícita de valor+data (confirmar_visita_eventual),
          // válida por 2h. Sem isso, NÃO agenda — devolve o motivo pro
          // modelo se autocorrigir em vez de agendar às cegas.
          if (tipoContrato === "eventual") {
            const confirmacaoValida = await getVisitaEventualConfirmacaoValida(supabase, conversationId);
            if (!confirmacaoValida) {
              result = {
                success: false,
                error: "eventual_sem_confirmacao",
                message: "Antes de agendar para cliente sem contrato: chame consultar_valor_visita, peça a confirmação do cliente sobre valor e data, e só então chame confirmar_visita_eventual. Depois disso, chame create_schedule de novo.",
              };
              break;
            }
          }

          if (!companyId) {
            result = { success: false, error: "Empresa não identificada — não é possível agendar." };
            break;
          }

          // ─── TRAVA (28/07/2026): create_schedule NÃO cria mais OS sozinho
          // — só propõe um horário candidato (previewSchedule, sem insert).
          // José pediu depois de um caso real de agendamento com empresa
          // ambígua. OS real só nasce depois de aprovação manual dele.
          const tecnico = await pickTechnician(supabase);
          const preview = await previewSchedule(supabase, {
            company_id: companyId,
            titulo: args.titulo,
            descricao: args.descricao,
            tipo_servico: args.tipo_servico,
            data_desejada: args.data,
            tecnico_preescolhido: tecnico,
          });

          if (!preview.success) {
            result = { success: false, error: preview.error };
            break;
          }

          const companyNameSched = context.contact?.companies?.nome_fantasia || "empresa não identificada";
          await supabase.from("agent_proposals").insert({
            departamento: "operacional",
            tipo_proposta: "agendamento_visita",
            titulo: `Agendamento — ${companyNameSched}`,
            justificativa: args.titulo,
            conteudo_proposto: args.descricao,
            destinatario_phone: phone,
            destinatario_company_id: companyId,
            dados_estruturados: {
              tipo_servico: args.tipo_servico,
              data_desejada: preview.data,
              hora_inicio: preview.hora_inicio,
              hora_fim: preview.hora_fim,
              modalidade: preview.modalidade,
              tecnico_id: preview.tecnico?.id,
              tecnico_nome: preview.tecnico?.nome,
            },
            created_by_agent: "waba-ai-agent",
          });

          result = {
            success: true,
            aguardando_confirmacao: true,
            horario_candidato: `${preview.data} ${preview.hora_inicio}-${preview.hora_fim}`,
            modalidade: preview.modalidade,
            message: "Pedido de agendamento registrado em /agent-proposals — informe ao cliente que a equipe vai confirmar em breve, NÃO trate como agendamento definitivo.",
          };
          console.log(`Schedule proposal registered (aguardando aprovação): ${preview.data} ${preview.hora_inicio} for ${phone}`);

          // === NOTIFICAR JOSÉ pra revisar na tela de Propostas ===
          try {
            const TECNICO_PHONE_SCHED = "5562999522470";
            const schedContactName = context.contact?.contact_name || phone;
            const schedMsg = `📅 *Pedido de agendamento — AGUARDANDO SUA APROVAÇÃO*\n\n` +
              `👤 *Cliente:* ${schedContactName}\n` +
              `📞 *Telefone:* ${phone}\n` +
              `🏢 *Empresa:* ${companyNameSched}\n\n` +
              `📋 *Título:* ${args.titulo}\n` +
              `📝 *Descrição:* ${args.descricao}\n\n` +
              `🗓️ *Horário candidato:* ${preview.data} ${preview.hora_inicio}-${preview.hora_fim}\n` +
              `🛠️ *Modalidade:* ${preview.modalidade}\n` +
              `🔧 *Técnico sugerido:* ${preview.tecnico?.nome}\n\n` +
              `⚠️ Revise e aprove em /agent-proposals para virar OS de verdade.`;

            await sendWabaText(TECNICO_PHONE_SCHED, schedMsg, { openTicket: false });
            console.log(`WhatsApp schedule candidate notification sent to ${TECNICO_PHONE_SCHED}`);
          } catch (schedNotifErr) {
            console.error("Failed to notify technician about schedule candidate:", schedNotifErr);
          }
        } catch (schedErr: any) {
          result = { success: false, error: schedErr.message };
        }
        break;
      }

      case "responder_orcamento": {
        const companyId = context.companyId;
        if (!companyId) {
          result = { success: false, error: "Cliente sem empresa vinculada — não há orçamento para responder." };
          break;
        }
        let orcQuery = supabase
          .from("orcamentos")
          .select("id, numero, valor_total, status")
          .eq("company_id", companyId);
        if (args.orcamento_numero) {
          orcQuery = orcQuery.eq("numero", args.orcamento_numero);
        } else {
          orcQuery = orcQuery.eq("status", "pendente");
        }
        const { data: orc } = await orcQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!orc) {
          result = { success: false, error: "Nenhum orçamento pendente encontrado para este cliente." };
          break;
        }

        const novoStatus = args.decisao === "aprovado" ? "aprovado" : "recusado";
        const { error: upErr } = await supabase
          .from("orcamentos")
          .update({ status: novoStatus })
          .eq("id", orc.id);
        if (upErr) {
          result = { success: false, error: upErr.message };
          break;
        }

        const contactName = context.contact?.contact_name || phone;
        const companyName = context.contact?.companies?.nome_fantasia || "empresa não identificada";
        const valor = `R$ ${Number(orc.valor_total || 0).toFixed(2)}`;
        const emoji = novoStatus === "aprovado" ? "✅" : "❌";
        await notifyTechnician(
          `${emoji} *Orçamento ${novoStatus.toUpperCase()}*\n\n` +
          `🧾 Orçamento #${orc.numero} — ${valor}\n` +
          `👤 Cliente: ${contactName}\n` +
          `📞 ${phone}\n` +
          `🏢 ${companyName}` +
          (args.observacao ? `\n\n📝 Obs. do cliente: ${args.observacao}` : "") +
          (novoStatus === "aprovado" ? `\n\n⚡ Dê sequência ao atendimento/OS.` : ""),
        );

        result = { success: true, orcamento: orc.numero, status: novoStatus };
        console.log(`Orçamento #${orc.numero} marcado como ${novoStatus} via IA`);
        break;
      }

      case "solicitar_orcamento": {
        const contactName = context.contact?.contact_name || phone;
        const companyName = context.contact?.companies?.nome_fantasia || "empresa não identificada";
        await notifyTechnician(
          `💬 *Pedido de Orçamento*\n\n` +
          `👤 Cliente: ${contactName}\n` +
          `📞 ${phone}\n` +
          `🏢 ${companyName}\n\n` +
          `📋 Pedido:\n${args.resumo}\n\n` +
          `⚡ Prepare o orçamento na plataforma e envie ao cliente.`,
        );
        result = { success: true, message: "Pedido de orçamento registrado e técnico notificado." };
        console.log(`Pedido de orçamento registrado para ${phone}`);
        break;
      }

      case "escalate_to_department": {
        const contactName = context.contact?.contact_name || phone;
        const companyName = context.contact?.companies?.nome_fantasia || "empresa não identificada";
        await supabase
          .from("waba_conversations")
          .update({ departamento_atual: args.departamento })
          .eq("id", conversationId);
        await notifyTechnician(
          `🏢 *Conversa encaminhada para ${args.departamento.toUpperCase()}*\n\n` +
          `👤 Cliente: ${contactName}\n` +
          `📞 ${phone}\n` +
          `🏢 ${companyName}\n\n` +
          `📋 Motivo: ${args.motivo}`,
        );
        result = { success: true, message: `Conversa encaminhada para o departamento ${args.departamento}.` };
        console.log(`Conversa ${conversationId} encaminhada para ${args.departamento}`);
        break;
      }

      case "propose_new_rule": {
        const contactName = context.contact?.contact_name || phone;
        const { data: proposal, error: proposalError } = await supabase
          .from("agent_proposals")
          .insert({
            departamento: args.departamento,
            tipo_proposta: "nova_regra_negocio",
            titulo: args.titulo,
            justificativa: args.justificativa,
            conteudo_proposto: args.conteudo_proposto,
            source_refs: { conversation_id: conversationId, phone },
            created_by_agent: "waba-ai-agent",
          })
          .select("id")
          .single();

        if (proposalError) {
          console.error("propose_new_rule insert error:", proposalError);
          result = { error: "Não foi possível registrar a sugestão." };
        } else {
          await notifyTechnician(
            `💡 *Nova sugestão — ${args.departamento.toUpperCase()}*\n\n` +
            `${args.titulo}\n\n` +
            `Origem: conversa com ${contactName} (${phone})\n\n` +
            `Revise na tela de Propostas de Agentes antes que vire regra.`,
          );
          result = { success: true, message: "Sugestão registrada. Fica pendente até o José revisar e aprovar — não vira regra sozinha." };
        }
        console.log(`Proposta ${proposal?.id} registrada para departamento ${args.departamento}`);
        break;
      }

      case "propose_commercial_message": {
        const contactName = context.contact?.contact_name || phone;
        const companyName = context.contact?.companies?.nome_fantasia || "empresa não identificada";
        // Destinatário SEMPRE resolvido do contexto já validado (nunca do texto
        // livre do cliente) — mesma barreira usada por responder_orcamento/
        // consultar_contrato pra nunca vazar/mandar pra empresa errada.
        const { data: proposal, error: proposalError } = await supabase
          .from("agent_proposals")
          .insert({
            departamento: "comercial",
            tipo_proposta: "mensagem_comercial",
            titulo: `Sugestão comercial para ${companyName}`,
            justificativa: args.motivo,
            conteudo_proposto: args.conteudo_proposto,
            destinatario_phone: phone,
            destinatario_company_id: context.companyId || null,
            source_refs: { conversation_id: conversationId, phone },
            created_by_agent: "waba-ai-agent",
          })
          .select("id")
          .single();

        if (proposalError) {
          console.error("propose_commercial_message insert error:", proposalError);
          result = { error: "Não foi possível registrar a sugestão." };
        } else {
          await notifyTechnician(
            `💡 *Sugestão comercial — ${companyName}*\n\n` +
            `👤 Cliente: ${contactName} (${phone})\n\n` +
            `📝 ${args.conteudo_proposto}\n\n` +
            `Motivo: ${args.motivo}\n\n` +
            `Revise na tela de Propostas de Agentes antes de enviar — nada foi mandado ao cliente ainda.`,
          );
          result = { success: true, message: "Sugestão registrada. Fica pendente até o José revisar e decidir enviar — nada é mandado ao cliente automaticamente." };
        }
        console.log(`Proposta comercial ${proposal?.id} registrada para ${phone}`);
        break;
      }

      case "consultar_valor_visita": {
        const { data: item, error: menuError } = await supabase
          .from("service_menu_items")
          .select("valor, horas_incluidas, descricao")
          .eq("nome", "visita_tecnica_padrao")
          .eq("ativo", true)
          .maybeSingle();

        if (menuError || !item) {
          result = { error: "Não foi possível consultar o valor da visita agora." };
        } else {
          result = {
            valor: Number(item.valor),
            horas_incluidas: Number(item.horas_incluidas),
            descricao: item.descricao,
          };
        }
        break;
      }

      case "confirmar_visita_eventual": {
        const { data: item } = await supabase
          .from("service_menu_items")
          .select("valor")
          .eq("nome", "visita_tecnica_padrao")
          .eq("ativo", true)
          .maybeSingle();

        const valorAtual = item ? Number(item.valor) : null;
        if (valorAtual === null || Math.abs(valorAtual - Number(args.valor)) > 0.01) {
          result = {
            success: false,
            error: "valor_nao_confere",
            message: `O valor informado (${args.valor}) não bate com o valor atual da visita (${valorAtual ?? "desconhecido"}). Chame consultar_valor_visita de novo e confirme o valor certo com o cliente.`,
          };
          break;
        }

        const { error: updateError } = await supabase
          .from("waba_conversations")
          .update({
            visita_eventual_valor: args.valor,
            visita_eventual_data: args.data_visita,
            visita_eventual_confirmada_em: new Date().toISOString(),
          })
          .eq("id", conversationId);

        if (updateError) {
          console.error("confirmar_visita_eventual update error:", updateError);
          result = { success: false, error: "Não foi possível registrar a confirmação." };
        } else {
          result = { success: true, message: `Confirmação registrada: R$${args.valor} para ${args.data_visita}. Agora pode chamar create_schedule.` };
          console.log(`Visita eventual confirmada para conversa ${conversationId}: R$${args.valor} em ${args.data_visita}`);
        }
        break;
      }

      case "consultar_contrato": {
        const companyId = context.companyId;
        if (!companyId) {
          result = { success: false, error: "empresa_nao_identificada" };
          break;
        }

        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("tipo, horas_contratadas, horas_consumidas, vigencia_fim, dia_vencimento, valor_mensal")
          .eq("company_id", companyId)
          .eq("status", "ativo")
          .maybeSingle();

        if (contractError || !contract) {
          result = { success: false, error: "sem_contrato_ativo" };
        } else {
          result = {
            success: true,
            tipo: contract.tipo,
            horas_contratadas: Number(contract.horas_contratadas || 0),
            horas_consumidas: Number(contract.horas_consumidas || 0),
            horas_restantes: Number(contract.horas_contratadas || 0) - Number(contract.horas_consumidas || 0),
            vigencia_fim: contract.vigencia_fim,
            dia_vencimento: contract.dia_vencimento,
            valor_mensal: contract.valor_mensal !== null ? Number(contract.valor_mensal) : null,
          };
        }
        break;
      }

      default:
        result = { error: "Unknown tool" };
    }

    results.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result),
    });
  }

  return results;
}

// ─── Notifica o técnico (José) via WhatsApp ──────────────────────────
async function notifyTechnician(text: string) {
  try {
    await sendWabaText("5562999522470", text, { openTicket: false });
  } catch (e) {
    console.error("notifyTechnician failed:", e);
  }
}

// ─── Send & Save Reply (Mabbix ou Evolution, conforme WABA_PROVIDER) ──

async function sendAndSaveReply(
  supabase: any,
  conversationId: string,
  phone: string,
  text: string
) {
  // Trava anti-corrida: entre o check inicial de ai_enabled e este envio
  // passam 10-30s (transcrição + GPT + tools). Se o técnico assumiu a
  // conversa nesse meio-tempo (ai_enabled já virou false, ou a última
  // mensagem é dele), a IA desiste em silêncio em vez de atropelar.
  const { data: convNow } = await supabase
    .from("waba_conversations")
    .select("ai_enabled")
    .eq("id", conversationId)
    .single();
  if (!convNow?.ai_enabled) {
    console.log("Send aborted: AI was disabled during processing", conversationId);
    return;
  }
  const { data: lastMsg } = await supabase
    .from("waba_messages")
    .select("direction, sender_type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    lastMsg?.direction === "outbound" &&
    (lastMsg.sender_type === "phone" || lastMsg.sender_type === "agent")
  ) {
    console.log("Send aborted: technician already replied in this conversation", conversationId);
    return;
  }

  const result = await sendWabaText(phone, text, { openTicket: false });
  console.log("AI reply sent via WABA:", JSON.stringify(result.raw).substring(0, 200));

  await supabase.from("waba_messages").insert({
    conversation_id: conversationId,
    wamid: result.providerMessageId,
    direction: "outbound",
    message_type: "text",
    content: text,
    status: "sent",
    sender_type: "ai",
  });

  await supabase
    .from("waba_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// ─── Track First Response ────────────────────────────────────────────

async function trackFirstResponse(supabase: any, conversationId: string) {
  await supabase
    .from("waba_conversations")
    .update({ first_response_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// ─── Audio Transcription via OpenAI Whisper ──────────────────────────

async function fetchImageAsDataUrl(mediaUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(mediaUrl);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    let ct = resp.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) ct = "image/jpeg";
    console.log(`Image downloaded: ${bytes.length} bytes, type: ${ct}`);
    return `data:${ct};base64,${base64}`;
  } catch (err) {
    console.error("Failed to fetch image:", err);
    return null;
  }
}

async function transcribeAudio(mediaUrl: string, apiKey: string): Promise<string> {
  try {
    // Download audio file
    const audioResponse = await fetch(mediaUrl);
    if (!audioResponse.ok) throw new Error(`Failed to download audio: ${audioResponse.status}`);

    const audioBuffer = await audioResponse.arrayBuffer();
    const contentType = audioResponse.headers.get("content-type") || "audio/ogg";

    // WhatsApp envia OGG/Opus. O Whisper aceita ogg/m4a/mp3/wav nativamente;
    // a extensão no nome do arquivo é o que sinaliza o formato pra API.
    const ext = contentType.includes("mp3") || contentType.includes("mpeg") ? "mp3"
      : contentType.includes("mp4") || contentType.includes("m4a") ? "m4a"
      : contentType.includes("wav") ? "wav"
      : "ogg";

    console.log(`Audio downloaded: ${audioBuffer.byteLength} bytes, ext: ${ext}`);

    // Endpoint dedicado de transcrição da OpenAI (Whisper). NÃO usar o /chat:
    // gpt-4o-mini não aceita áudio, e o input_audio do chat só aceita wav/mp3.
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("response_format", "json");

    const transcribeResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // NÃO definir Content-Type: o fetch monta o boundary do multipart sozinho.
      },
      body: form,
    });

    if (!transcribeResponse.ok) {
      const errText = await transcribeResponse.text();
      console.error("Transcription error:", errText);
      throw new Error(`Transcription failed: ${transcribeResponse.status}`);
    }

    const transcribeResult = await transcribeResponse.json();
    const transcription = (transcribeResult.text || "").trim();

    if (!transcription) throw new Error("Empty transcription");

    return transcription;
  } catch (error: any) {
    console.error("Audio transcription failed:", error);
    return "[Áudio recebido - não foi possível transcrever]";
  }
}

// ─── Send Audio Reply via OpenAI (TTS) + WABA (Mabbix ou Evolution) ────

async function sendAudioReply(
  supabase: any,
  conversationId: string,
  phone: string,
  text: string
) {
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.log("OPENAI_API_KEY not configured, skipping audio reply");
      return;
    }

    // Limit text for TTS
    const ttsText = text.substring(0, 3000);

    // Use Gemini multimodal to generate speech audio
    // We ask Gemini to produce a spoken audio response
    const ttsResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        modalities: ["AUDIO"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: "Kore",
            },
          },
        },
        messages: [
          {
            role: "system",
            content: "Você é uma assistente de suporte técnico brasileira. Leia o texto fornecido em voz alta de forma natural, clara e profissional em português brasileiro. Não adicione nenhum comentário, apenas fale o texto.",
          },
          {
            role: "user",
            content: `Leia este texto em voz alta: "${ttsText}"`,
          },
        ],
      }),
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("OpenAI TTS error:", ttsResponse.status, errText);
      return;
    }

    const ttsResult = await ttsResponse.json();
    
    // Extract audio data from the response
    const audioContent = ttsResult.choices?.[0]?.message?.audio?.data;
    
    if (!audioContent) {
      console.log("No audio data in TTS response, skipping audio reply");
      return;
    }

    console.log(`TTS audio generated via OpenAI`);

    // Envia o audio via WABA (Mabbix mantem o formato data-URI de sempre;
    // sendWabaAudio normaliza para base64 puro quando o provedor e Evolution)
    const sendResult = await sendWabaAudio(phone, `data:audio/mp3;base64,${audioContent}`);
    console.log("Audio reply sent via WABA:", JSON.stringify(sendResult.raw).substring(0, 200));

    // Save audio message to DB
    await supabase.from("waba_messages").insert({
      conversation_id: conversationId,
      wamid: sendResult.providerMessageId,
      direction: "outbound",
      message_type: "audio",
      content: `[Áudio] ${text.substring(0, 200)}`,
      status: "sent",
      sender_type: "ai",
    });

    await supabase
      .from("waba_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log("Audio reply saved and sent successfully");
  } catch (error: any) {
    console.error("Failed to send audio reply:", error);
    // Don't throw - audio is supplementary, text was already sent
  }
}
