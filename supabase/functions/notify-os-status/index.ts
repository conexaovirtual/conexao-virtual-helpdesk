import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// SEM 'executada'/'finalizada' de propósito (decisão José, 28/07/2026): cliente
// não deve receber WhatsApp nenhum quando o atendimento/chamado é CONCLUÍDO —
// só nas etapas de agendamento/execução em andamento. Ver [[conexao-virtual-stack]].
const statusMessages: Record<string, string> = {
  agendada: "📅 *Ordem de Serviço Criada*\n\nSua OS #{numero_os} foi registrada e está agendada. Em breve um técnico entrará em contato para confirmação.",
  confirmada: "✅ *Ordem de Serviço Confirmada*\n\nSua OS #{numero_os} foi confirmada pelo técnico e será atendida em breve.",
  em_execucao: "🔧 *Atendimento Iniciado*\n\nO técnico iniciou o atendimento da sua OS #{numero_os}. Acompanharemos você até a conclusão.",
  cancelada: "❌ *Ordem de Serviço Cancelada*\n\nA OS #{numero_os} foi cancelada. Se tiver dúvidas, entre em contato conosco.",
};

function formatPhone(contato: string): string | null {
  const digits = contato.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

// Deduplicação: evita reenviar a mesma transição de status para a mesma OS.
async function alreadyNotified(supabase: any, entityId: string, status: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_notification_log")
    .select("status")
    .eq("entity_type", "service_order")
    .eq("entity_id", entityId)
    .order("sent_at", { ascending: false })
    .limit(1);
  return !!(data && data.length && data[0].status === status);
}

async function logNotification(supabase: any, entityId: string, status: string, phone: string | null): Promise<void> {
  await supabase.from("whatsapp_notification_log").insert({
    entity_type: "service_order",
    entity_id: entityId,
    status,
    phone,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_order_id, new_status, observacao } = await req.json();

    if (!service_order_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "service_order_id and new_status are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const messageTemplate = statusMessages[new_status];
    if (!messageTemplate) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `No notification for status: ${new_status}` }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // DEDUP: se a última notificação dessa OS já foi esse mesmo status, não reenvia.
    if (await alreadyNotified(supabase, service_order_id, new_status)) {
      console.log(`Skip duplicate OS notification (status: ${new_status})`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "duplicate status" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: so, error: soError } = await supabase
      .from("service_orders")
      .select("numero_os, ticket_id, company_id, descricao_servicos, asset_id, equipamento_descricao")
      .eq("id", service_order_id)
      .single();

    if (soError || !so) {
      console.error("OS not found:", soError);
      return new Response(
        JSON.stringify({ error: "Service order not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let phone: string | null = null;
    let contactName: string | null = null;

    if (so.ticket_id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("solicitante_contato, solicitante_nome")
        .eq("id", so.ticket_id)
        .single();

      if (ticket?.solicitante_contato) {
        phone = formatPhone(ticket.solicitante_contato);
        contactName = ticket.solicitante_nome;
      }
    }

    if (!phone && so.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("whatsapp, nome_fantasia")
        .eq("id", so.company_id)
        .single();

      if (company?.whatsapp) {
        phone = formatPhone(company.whatsapp);
        contactName = contactName || company.nome_fantasia;
      }
    }

    if (!phone) {
      console.log("No valid phone number found for OS notification");
      return new Response(
        JSON.stringify({ skipped: true, reason: "No valid phone number found" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let message = messageTemplate.replace(/#{numero_os}/g, String(so.numero_os));

    if (so.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("nome_fantasia")
        .eq("id", so.company_id)
        .single();
      if (company) {
        message += `\n\n🏢 Empresa: ${company.nome_fantasia}`;
      }
    }

    let equipamentoLabel: string | null = null;
    if (so.asset_id) {
      const { data: asset } = await supabase
        .from("assets")
        .select("nome, modelo, tag_patrimonial")
        .eq("id", so.asset_id)
        .single();
      if (asset) {
        equipamentoLabel = asset.nome;
        if (asset.modelo) equipamentoLabel += ` (${asset.modelo})`;
        if (asset.tag_patrimonial) equipamentoLabel += ` - Patrimônio: ${asset.tag_patrimonial}`;
      }
    }
    if (!equipamentoLabel && so.equipamento_descricao) {
      equipamentoLabel = so.equipamento_descricao;
    }
    if (equipamentoLabel) {
      message += `\n🖥️ Equipamento: ${equipamentoLabel}`;
    }

    if (new_status === "executada" || new_status === "finalizada") {
      if (observacao) {
        message += `\n📝 Observação: ${observacao}`;
      }
    }

    message += "\n\n_Conexão Virtual - Help Desk TI_";

    console.log(`Sending OS status notification to ${phone} (status: ${new_status})`);

    const result = await sendWabaText(phone, message, { openTicket: false });
    console.log("WABA notification response:", JSON.stringify(result.raw).substring(0, 300));

    // Registra no log para deduplicação das próximas chamadas.
    await logNotification(supabase, service_order_id, new_status, phone);

    return new Response(
      JSON.stringify({ success: true, phone, status: new_status }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("notify-os-status error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
