import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const adminPhone = "5562999522470";

  async function sendWhatsApp(phone: string, msg: string) {
    try {
      await sendWabaText(phone, msg, { openTicket: false });
    } catch (e) {
      console.error("[SLA-Alert] Falha WhatsApp:", e);
    }
  }

  function formatRemaining(ms: number): string {
    const absMs = Math.abs(ms);
    const h = Math.floor(absMs / 3600000);
    const m = Math.floor((absMs % 3600000) / 60000);
    if (ms < 0) return h > 0 ? `${h}h ${m}m atrasado` : `${m}m atrasado`;
    return h > 0 ? `${h}h ${m}m restantes` : `${m}m restantes`;
  }

  try {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // Busca tickets abertos com SLA vencendo em até 1h OU já vencido, ainda não alertados
    const { data: tickets, error } = await supabase
      .from("tickets")
      .select(`
        id, numero, titulo, prioridade, status, sla_solucao_limite,
        tecnico_id,
        companies(nome_fantasia),
        profiles_tecnico:profiles!tickets_tecnico_id_fkey(nome, telefone)
      `)
      .in("status", ["novo", "em_atendimento", "aguardando_usuario"])
      .lte("sla_solucao_limite", in1h.toISOString())
      .is("sla_escalado", null);

    if (error) throw error;

    let alertsSent = 0;

    for (const ticket of tickets || []) {
      const limite = new Date(ticket.sla_solucao_limite);
      const diff = limite.getTime() - now.getTime();
      const empresa = (ticket.companies as any)?.nome_fantasia || "cliente";
      const prioridade = ticket.prioridade?.toUpperCase() || "MÉDIA";
      const status = ticket.status?.replace(/_/g, " ") || "";

      const emoji = diff < 0 ? "🔴" : diff < 30 * 60000 ? "🟠" : "🟡";
      const situacao = diff < 0 ? "SLA *VIOLADO*" : "SLA *prestes a vencer*";

      const msg =
        `${emoji} *ALERTA DE SLA*\n\n` +
        `${situacao} — ${formatRemaining(diff)}\n\n` +
        `📋 Chamado: *#${ticket.numero}*\n` +
        `📝 ${ticket.titulo}\n` +
        `🏢 ${empresa}\n` +
        `⚡ Prioridade: ${prioridade}\n` +
        `📌 Status: ${status}\n` +
        `⏰ Prazo: ${limite.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

      // Avisa o admin sempre
      await sendWhatsApp(adminPhone, msg);

      // Avisa o técnico responsável se tiver telefone diferente
      const tecTel = (ticket.profiles_tecnico as any)?.telefone;
      if (tecTel && tecTel !== adminPhone) {
        const normalized = tecTel.replace(/\D/g, "");
        const phone = normalized.startsWith("55") ? normalized : `55${normalized}`;
        await sendWhatsApp(phone, msg);
      }

      // Marca como alertado para não repetir
      await supabase
        .from("tickets")
        .update({ sla_escalado: now.toISOString() })
        .eq("id", ticket.id);

      alertsSent++;
      console.log(`[SLA-Alert] Alerta enviado para ticket #${ticket.numero}`);
    }

    return new Response(
      JSON.stringify({ success: true, alertsSent, checked: tickets?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SLA-Alert] Erro:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
