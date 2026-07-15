import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText, sendWabaMedia, sendWabaAudio } from "../_shared/waba-provider.ts";

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

    const { action, ...params } = await req.json();
    console.log("WABA send action:", action);

    switch (action) {
      case "send_text": {
        const { phone, text, conversation_id, open_ticket } = params;

        const result = await sendWabaText(phone, text, { openTicket: !!open_ticket });
        console.log("WABA send_text response:", JSON.stringify(result.raw).substring(0, 300));

        // Save outbound message to DB only if linked to a conversation
        if (conversation_id) {
          await supabase.from("waba_messages").insert({
            conversation_id,
            wamid: result.providerMessageId,
            direction: "outbound",
            message_type: "text",
            content: text,
            status: "sent",
            sender_type: "agent",
          });

          // Update conversation: last_message, first_response, queue_status
          const { data: conv } = await supabase
            .from("waba_conversations")
            .select("first_response_at, queue_status")
            .eq("id", conversation_id)
            .single();

          const updates: any = { last_message_at: new Date().toISOString() };
          if (!conv?.first_response_at) {
            updates.first_response_at = new Date().toISOString();
          }
          if (conv?.queue_status === "waiting") {
            updates.queue_status = "assigned";
          }

          await supabase
            .from("waba_conversations")
            .update(updates)
            .eq("id", conversation_id);
        }

        return new Response(JSON.stringify(result.raw), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "send_media": {
        const { phone, media_url, filename, caption, media_type, conversation_id, open_ticket } = params;

        const result = await sendWabaMedia(phone, media_url, {
          filename,
          caption,
          mediaType: media_type,
          openTicket: !!open_ticket,
        });
        console.log("WABA send_media response:", JSON.stringify(result.raw).substring(0, 400));

        if (conversation_id) {
          await supabase.from("waba_messages").insert({
            conversation_id,
            wamid: result.providerMessageId,
            direction: "outbound",
            message_type: media_type || "document",
            content: caption || `[${filename || "Arquivo"}]`,
            media_url,
            status: "sent",
            sender_type: "agent",
          });

          const { data: conv } = await supabase
            .from("waba_conversations")
            .select("first_response_at, queue_status")
            .eq("id", conversation_id)
            .single();

          const updates: any = { last_message_at: new Date().toISOString() };
          if (!conv?.first_response_at) updates.first_response_at = new Date().toISOString();
          if (conv?.queue_status === "waiting") updates.queue_status = "assigned";

          await supabase.from("waba_conversations").update(updates).eq("id", conversation_id);
        }

        return new Response(JSON.stringify(result.raw), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      case "send_audio": {
        const { phone, audio_base64, conversation_id } = params;

        const result = await sendWabaAudio(phone, audio_base64);
        console.log("WABA send_audio response:", JSON.stringify(result.raw).substring(0, 300));

        // Save outbound audio message to DB
        await supabase.from("waba_messages").insert({
          conversation_id,
          wamid: result.providerMessageId,
          direction: "outbound",
          message_type: "audio",
          content: "[Mensagem de áudio]",
          status: "sent",
          sender_type: "agent",
        });

        // Update conversation timestamps
        const { data: conv } = await supabase
          .from("waba_conversations")
          .select("first_response_at, queue_status")
          .eq("id", conversation_id)
          .single();

        const updates: any = { last_message_at: new Date().toISOString() };
        if (!conv?.first_response_at) {
          updates.first_response_at = new Date().toISOString();
        }
        if (conv?.queue_status === "waiting") {
          updates.queue_status = "assigned";
        }

        await supabase
          .from("waba_conversations")
          .update(updates)
          .eq("id", conversation_id);

        return new Response(JSON.stringify(result.raw), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
  } catch (error: any) {
    console.error("WABA send error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
