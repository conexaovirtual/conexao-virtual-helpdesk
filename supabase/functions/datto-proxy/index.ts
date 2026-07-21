/**
 * datto-proxy — Recebe webhook do Datto e repassa para datto-rmm-webhook
 * sem verificação JWT.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-datto-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get("x-datto-secret");
    const webhookSecret = Deno.env.get("DATTO_WEBHOOK_SECRET");

    if (!webhookSecret || secret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();

    // Repassa para o projeto principal
    const targetUrl = "https://ispqekzrrufhzdqhjnck.supabase.co/functions/v1/datto-rmm-webhook";
    const anonKey = Deno.env.get("MAIN_ANON_KEY")!;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
        "x-datto-secret": webhookSecret,
      },
      body,
    });

    const result = await response.text();
    console.log("Proxy response:", response.status, result.substring(0, 200));

    return new Response(result, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
