import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rawBody = await req.text();
    
    // Request-level dedup: hash the raw body to detect identical payloads
    const payloadHash = await hashPayload(rawBody);
    
    const body = JSON.parse(rawBody);
    console.log("Mabbix webhook received:", rawBody.substring(0, 500));

    const acao = body.acao;
    const hasMensagem = body.mensagem !== undefined;
    const hasSender = body.sender !== undefined;

    // Handle ticket lifecycle events
    if (acao === "closed" || acao === "action_from_user" || (acao === "open" && !hasMensagem)) {
      console.log(`Lifecycle event: ${acao}`);
      return okResponse();
    }

    // Handle message echo (mensagem as object with fromMe)
    if (hasMensagem && !Array.isArray(body.mensagem) && typeof body.mensagem === "object") {
      const msg = body.mensagem;
      
      if (msg.fromMe === true) {
        // When the business sends from phone, sender = recipient (customer) phone
        const recipientPhone = extractPhone(body.sender || msg.participant || "");
        console.log(`Outbound echo detected, recipient phone: ${recipientPhone}, raw sender: ${body.sender}`);
        if (recipientPhone) {
          await saveOutboundMessage(supabase, {
            phoneNumber: recipientPhone,
            contactName: body.name,
            content: msg.body || "",
            messageType: detectMessageType(msg.mediaType, msg.mediaUrl),
            mediaUrl: msg.mediaUrl || null,
            wamid: msg.wid || `outecho_${msg.id || payloadHash}`,
            rawPayload: body,
          });
          await disableAIForPhoneConversation(supabase, recipientPhone, msg.body || "");
        }
        return okResponse();
      }

      const participantRaw = msg.participant || "";
      const senderBodyRaw = body.sender || "";
      const phoneNumber = resolveConversationKey(senderBodyRaw, participantRaw);
      if (!phoneNumber) {
        console.log("No valid phone in message object payload, skipping");
        return okResponse();
      }

      const contactName = body.name || "Desconhecido";
      const content = msg.body || "[Mensagem sem texto]";
      const messageType = detectMessageType(msg.mediaType, msg.mediaUrl);
      const mediaUrl = msg.mediaUrl || null;
      // Use the real WhatsApp message ID (wid) - this is deterministic
      const wamid = msg.wid || `obj_${msg.id || payloadHash}`;

      await saveInboundMessage(supabase, {
        phoneNumber,
        contactName,
        content,
        messageType,
        mediaUrl,
        wamid,
        rawPayload: body,
        isGroup: isGroupChat(senderBodyRaw || participantRaw),
      });

      return okResponse();
    }

    // Handle message array format
    if (hasMensagem && Array.isArray(body.mensagem) && hasSender) {
      if (body.fromMe === true) {
        console.log("Outbound message array echo — salvando na plataforma e checando IA");
        const senderPhone = extractPhone(body.sender || "");
        if (senderPhone) {
          for (let i = 0; i < body.mensagem.length; i++) {
            const m = body.mensagem[i];
            await saveOutboundMessage(supabase, {
              phoneNumber: senderPhone,
              contactName: body.name,
              content: m.text || m.body || "",
              messageType: m.type || detectMessageType(m.mediaType, m.fileUrl),
              mediaUrl: m.fileUrl || m.mediaUrl || null,
              wamid: m.wid || (body.chamadoId ? `outecho_${body.chamadoId}_${i}` : `outecho_${payloadHash}_${i}`),
              rawPayload: body,
            });
          }
          const echoText = body.mensagem[0]?.text || body.mensagem[0]?.body || "";
          await disableAIForPhoneConversation(supabase, senderPhone, echoText);
        }
        return okResponse();
      }

      const senderRaw = body.sender;
      const phoneNumber = resolveConversationKey(senderRaw, "");
      if (!phoneNumber) {
        console.log("No phone in array payload, skipping");
        return okResponse();
      }
      const groupFlag = isGroupChat(senderRaw);
      const contactName = body.name || "Desconhecido";

      for (let i = 0; i < body.mensagem.length; i++) {
        const msgItem = body.mensagem[i];
        const content = msgItem.text || msgItem.body || "[Mensagem sem texto]";
        const messageType = msgItem.type || "text";
        const mediaUrl = msgItem.fileUrl || null;
        // Deterministic wamid: chamadoId + index (NOT Date.now() which varies between parallel requests)
        const wamid = body.chamadoId 
          ? `mabbix_${body.chamadoId}_${i}` 
          : `mabbix_${payloadHash}_${i}`;

        await saveInboundMessage(supabase, {
          phoneNumber,
          contactName,
          content,
          messageType,
          mediaUrl,
          wamid,
          rawPayload: body,
          isGroup: groupFlag,
        });
      }

      return okResponse();
    }

    console.log("Unhandled Mabbix payload structure, acao:", acao);
    return okResponse();
  } catch (error: any) {
    console.error("Mabbix webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function extractPhone(raw: string): string {
  return raw.replace(/@.*$/, "").replace(/\D/g, "");
}

function isGroupChat(raw: string): boolean {
  return raw.includes("@g.us");
}

function isLid(raw: string): boolean {
  return raw.includes("@lid");
}

// Picks a single canonical conversation key so the same chat never splits into
// multiple conversations. Group chats always key on the group JID; @lid
// identifiers are only used when no real phone number is available.
function resolveConversationKey(senderRaw: string, participantRaw: string): string {
  if (isGroupChat(senderRaw)) return extractPhone(senderRaw);
  if (isGroupChat(participantRaw)) return extractPhone(participantRaw);

  const candidates = [senderRaw, participantRaw].filter(Boolean);
  const realPhones = candidates
    .filter((c) => !isLid(c))
    .map(extractPhone)
    .filter((p) => p.length >= 10 && p.length <= 15);
  if (realPhones.length > 0) return realPhones[0];

  // Last resort: lid digits (still stable per contact, avoids dropping the message)
  return extractPhone(candidates[0] || "");
}

function detectMessageType(mediaType?: string, mediaUrl?: string): string {
  if (!mediaType && !mediaUrl) return "text";
  if (mediaType?.includes("image") || mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)/i)) return "image";
  if (mediaType?.includes("audio")) return "audio";
  if (mediaType?.includes("video")) return "video";
  if (mediaType?.includes("document") || mediaType?.includes("application")) return "document";
  if (mediaType === "conversation" || mediaType === "extendedTextMessage") return "text";
  return mediaUrl ? "document" : "text";
}

async function hashPayload(raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

interface InboundMessageData {
  phoneNumber: string;
  contactName: string;
  content: string;
  messageType: string;
  mediaUrl: string | null;
  wamid: string;
  rawPayload: any;
  isGroup: boolean;
}

async function saveInboundMessage(supabase: any, data: InboundMessageData) {
  const { phoneNumber, contactName, content, messageType, mediaUrl, wamid, rawPayload, isGroup } = data;

  // Single atomic check: try to find existing message by wamid first
  // This is the fast path - if wamid exists, skip immediately
  if (wamid) {
    const { data: existingByWamid } = await supabase
      .from("waba_messages")
      .select("id")
      .eq("wamid", wamid)
      .limit(1);
    if (existingByWamid && existingByWamid.length > 0) {
      console.log(`Duplicate by wamid skipped: ${wamid}`);
      return;
    }
  }

  // ─── Fetch existing conversation BEFORE upsert to check last_message_at ───
  const { data: existingConv } = await supabase
    .from("waba_conversations")
    .select("id, ai_enabled, last_message_at")
    .eq("phone_number", phoneNumber)
    .limit(1)
    .maybeSingle();

  const previousLastMsgAt = existingConv?.last_message_at || null;
  const previousAiEnabled = existingConv?.ai_enabled ?? true;

  // Upsert conversation
  const profilePhotoUrl = rawPayload?.profilePicUrl || rawPayload?.profilePic || rawPayload?.senderPhoto || null;

  const upsertData: any = {
    phone_number: phoneNumber,
    contact_name: contactName,
    last_message_at: new Date().toISOString(),
    status: "active",
  };
  if (profilePhotoUrl) {
    upsertData.profile_photo_url = profilePhotoUrl;
  }

  const { data: conversation } = await supabase
    .from("waba_conversations")
    .upsert(upsertData, { onConflict: "phone_number" })
    .select()
    .single();

  if (!conversation) {
    console.error("Failed to upsert conversation for", phoneNumber);
    return;
  }

  // ─── Auto-reactivate AI if disabled and last interaction was 30+ minutes ago ───
  if (!previousAiEnabled) {
    const lastMsgTime = new Date(previousLastMsgAt || 0).getTime();
    const now = Date.now();
    const minutesSinceLastMsg = (now - lastMsgTime) / (1000 * 60);
    const REACTIVATION_THRESHOLD_MINUTES = 30;

    if (minutesSinceLastMsg >= REACTIVATION_THRESHOLD_MINUTES) {
      await supabase
        .from("waba_conversations")
        .update({ ai_enabled: true, queue_status: "waiting" })
        .eq("id", conversation.id);
      conversation.ai_enabled = true;
      console.log(`AI auto-reactivated for ${phoneNumber} after ${minutesSinceLastMsg.toFixed(0)}min of inactivity`);
    }
  }

  // Cross-format dedup: Mabbix delivers the same WhatsApp message in separate
  // webhook events (acao "start" + "from_internal") with unrelated wamids, so
  // also skip when identical inbound content just arrived in this conversation.
  const dedupWindowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: contentDup } = await supabase
    .from("waba_messages")
    .select("id")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .eq("content", content)
    .gte("created_at", dedupWindowStart)
    .limit(1);
  if (contentDup && contentDup.length > 0) {
    console.log(`Duplicate by content skipped for conversation ${conversation.id}`);
    return;
  }

  // Insert message - rely on DB unique index as the definitive guard against race conditions
  const { data: insertedMsg, error: insertError } = await supabase.from("waba_messages").insert({
    conversation_id: conversation.id,
    wamid: wamid || null,
    direction: "inbound",
    message_type: messageType,
    content,
    media_url: mediaUrl,
    status: "received",
    raw_payload: rawPayload,
    sender_type: "user",
  }).select("id").single();

  if (insertError) {
    if (insertError.code === "23505") {
      console.log(`DB-level duplicate prevented for wamid: ${wamid}`);
      return;
    }
    console.error("Insert message error:", insertError);
    return;
  }

  // Post-insert race guard: the two Mabbix events often arrive milliseconds
  // apart, so both can pass the check above. Keep only the earliest copy; if
  // ours lost the race, remove it and stop (the survivor drives the AI reply).
  const { data: twins } = await supabase
    .from("waba_messages")
    .select("id, created_at")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .eq("content", content)
    .gte("created_at", dedupWindowStart)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (twins && twins.length > 1 && twins[0].id !== insertedMsg.id) {
    await supabase.from("waba_messages").delete().eq("id", insertedMsg.id);
    console.log(`Race duplicate removed: ${insertedMsg.id}`);
    return;
  }

  console.log(`Message saved from ${phoneNumber}: ${content.substring(0, 80)}`);

  // ─── CSAT: captura nota 1-5 se houver pesquisa pendente (antes da IA) ───
  const ratingMatch = (content || "").trim().match(/^([1-5])$/);
  if (ratingMatch) {
    const captured = await captureCsatRating(supabase, conversation.id, phoneNumber, parseInt(ratingMatch[1]));
    if (captured) {
      console.log(`CSAT nota ${ratingMatch[1]} capturada para ${phoneNumber}`);
      return; // não aciona a IA — a resposta era a avaliação
    }
  }

  // Global AI kill-switch: set WABA_AI_DISABLED=true in secrets to fully disable AI replies
  const aiGloballyDisabled = (Deno.env.get("WABA_AI_DISABLED") || "").toLowerCase() === "true";
  // Trigger AI Agent for text, audio and image messages
  const shouldTriggerAI = !aiGloballyDisabled && (
    (messageType === "text" && content && content !== "[Mensagem sem texto]") ||
    messageType === "audio" ||
    (messageType === "image" && mediaUrl)
  );
  if (aiGloballyDisabled) {
    console.log("AI globally disabled via WABA_AI_DISABLED — skipping AI agent invocation");
  }
  if (shouldTriggerAI) {
    try {
      const aiResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/waba-ai-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_content: content,
            phone_number: phoneNumber,
            is_group: isGroup,
            media_url: mediaUrl,
            message_type: messageType,
          }),
        }
      );
      const aiResult = await aiResponse.json();
      console.log("AI Agent result:", JSON.stringify(aiResult).substring(0, 200));
    } catch (aiErr) {
      console.error("AI Agent invocation failed:", aiErr);
    }
  }
}

// Salva mensagens enviadas pelo próprio celular do negócio (eco fromMe) para que
// apareçam na plataforma. Pula ecos de envios feitos pela própria plataforma/IA
// (mesmo conteúdo outbound nos últimos 2 min) para não duplicar.
async function saveOutboundMessage(supabase: any, data: {
  phoneNumber: string; contactName?: string; content: string;
  messageType: string; mediaUrl: string | null; wamid: string; rawPayload: any;
}) {
  const { phoneNumber, contactName, content, messageType, mediaUrl, wamid, rawPayload } = data;
  if (!content && !mediaUrl) return;

  // Dedup por wamid
  if (wamid) {
    const { data: existingByWamid } = await supabase
      .from("waba_messages").select("id").eq("wamid", wamid).limit(1);
    if (existingByWamid && existingByWamid.length > 0) {
      console.log(`Outbound duplicate by wamid skipped: ${wamid}`);
      return;
    }
  }

  // Usa conversa existente ou cria
  const { data: existingConv } = await supabase
    .from("waba_conversations").select("id").eq("phone_number", phoneNumber).limit(1).maybeSingle();
  let conversationId = existingConv?.id;
  if (!conversationId) {
    const { data: created } = await supabase
      .from("waba_conversations")
      .upsert({ phone_number: phoneNumber, contact_name: contactName || phoneNumber, last_message_at: new Date().toISOString(), status: "active" }, { onConflict: "phone_number" })
      .select("id").single();
    conversationId = created?.id;
  } else {
    await supabase.from("waba_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
  }
  if (!conversationId) { console.error("Outbound: sem conversa para", phoneNumber); return; }

  // Dedup por conteúdo outbound recente (eco de envio da plataforma/IA → já gravado)
  const dedupWindowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: contentDup } = await supabase
    .from("waba_messages").select("id")
    .eq("conversation_id", conversationId).eq("direction", "outbound").eq("content", content)
    .gte("created_at", dedupWindowStart).limit(1);
  if (contentDup && contentDup.length > 0) {
    console.log(`Outbound echo da plataforma/IA pulado (dup conteúdo) para ${phoneNumber}`);
    return;
  }

  const { error: insertError } = await supabase.from("waba_messages").insert({
    conversation_id: conversationId,
    wamid: wamid || null,
    direction: "outbound",
    message_type: messageType,
    content,
    media_url: mediaUrl,
    status: "sent",
    raw_payload: rawPayload,
    sender_type: "phone",
  });
  if (insertError) {
    if (insertError.code === "23505") return;
    console.error("Insert outbound (phone) error:", insertError);
    return;
  }
  console.log(`Outbound (celular) salvo para ${phoneNumber}: ${(content || "[mídia]").substring(0, 80)}`);
}

// Registra a nota de CSAT se houver pesquisa pendente para este telefone.
// Retorna true se capturou (e nesse caso a IA NÃO deve responder).
async function captureCsatRating(supabase: any, conversationId: string, phoneNumber: string, rating: number): Promise<boolean> {
  try {
    const digits = (phoneNumber || "").replace(/\D/g, "");
    if (!digits) return false;
    const candidates = Array.from(new Set([digits, digits.startsWith("55") ? digits : "55" + digits]));
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pending } = await supabase
      .from("csat_responses")
      .select("id")
      .is("rating", null)
      .eq("status", "enviado")
      .gte("created_at", since)
      .in("phone", candidates)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!pending || pending.length === 0) return false;

    await supabase
      .from("csat_responses")
      .update({ rating, status: "respondido", responded_at: new Date().toISOString() })
      .eq("id", pending[0].id);

    const thanks = rating >= 4
      ? "Obrigado pela avaliação! 🙏 Ficamos muito felizes que tenha gostado do atendimento."
      : "Obrigado pelo retorno! 🙏 Vamos trabalhar para melhorar — se quiser, conte o que podemos fazer melhor.";

    // Envia o agradecimento e salva como 'agent' para que o eco NÃO desligue a IA
    const MABBIX_URL = Deno.env.get("MABBIX_BACKEND_URL")?.replace("//chat.mabbix.com.br", "//apichat.mabbix.com.br");
    const MABBIX_TOKEN = Deno.env.get("MABBIX_CONNECTION_TOKEN");
    if (MABBIX_URL && MABBIX_TOKEN) {
      await fetch(`${MABBIX_URL}/api/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MABBIX_TOKEN}` },
        body: JSON.stringify({ number: phoneNumber, body: thanks, openTicket: "0", queueId: "0" }),
      });
    }
    await supabase.from("waba_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      message_type: "text",
      content: thanks,
      sender_type: "agent",
      status: "sent",
    });

    return true;
  } catch (err) {
    console.error("captureCsatRating error:", err);
    return false;
  }
}

async function disableAIForPhoneConversation(supabase: any, phoneNumber: string, echoContent: string = "") {
  try {
    // Find conversation by phone number where AI is still enabled
    const { data: conv } = await supabase
      .from("waba_conversations")
      .select("id, ai_enabled")
      .eq("phone_number", phoneNumber)
      .eq("ai_enabled", true)
      .limit(1);

    if (!conv || conv.length === 0) return;
    const conversationId = conv[0].id;

    // Mabbix echoes our OWN API sends back as fromMe=true, identical to a message
    // the technician typed on the phone. Without distinguishing them, the AI would
    // disable itself after every reply. So only treat this as a human takeover when
    // the echo does NOT match something the AI/platform just sent.
    const since = new Date(Date.now() - 120000).toISOString();
    const { data: recentOwn } = await supabase
      .from("waba_messages")
      .select("content")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .in("sender_type", ["ai", "agent"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);

    const echo = (echoContent || "").trim();
    const own = recentOwn || [];
    // Text echo: match by content. Media/empty echo: skip if we just sent anything
    // (covers AI audio/media replies); a real phone takeover with no recent AI
    // activity still disables correctly.
    const isOwnEcho = echo
      ? own.some((m: any) => (m.content || "").trim() === echo)
      : own.length > 0;
    if (isOwnEcho) {
      console.log(`Echo of AI/platform message for ${phoneNumber} — keeping AI enabled`);
      return;
    }

    await supabase
      .from("waba_conversations")
      .update({ ai_enabled: false })
      .eq("id", conversationId);

    // Insert system message to log the handover
    await supabase.from("waba_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      message_type: "system",
      content: "Técnico assumiu pelo telefone — IA desativada automaticamente",
      sender_type: "system",
      status: "delivered",
    });

    console.log(`AI disabled for conversation ${conversationId} — human sent from phone`);
  } catch (err) {
    console.error("Error disabling AI for phone conversation:", err);
  }
}
