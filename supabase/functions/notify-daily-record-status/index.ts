import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const statusMessages: Record<string, string> = {
  em_andamento: "🔧 *Atendimento em Andamento*\n\nSeu atendimento técnico está sendo realizado agora.",
  concluido: "✅ *Comprovante de Atendimento*\n\nSeu atendimento foi concluído com sucesso!",
  pendente: "⏳ *Atendimento Pendente*\n\nSeu atendimento está pendente e será retomado em breve.",
};

function formatPhone(contato: string): string | null {
  if (!contato) return null;
  const digits = contato.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

// Deduplicação: evita reenviar a mesma transição de status para o mesmo atendimento.
async function alreadyNotified(supabase: any, entityId: string, status: string): Promise<boolean> {
  const { data } = await supabase
    .from("whatsapp_notification_log")
    .select("status")
    .eq("entity_type", "daily_record")
    .eq("entity_id", entityId)
    .order("sent_at", { ascending: false })
    .limit(1);
  return !!(data && data.length && data[0].status === status);
}

async function logNotification(supabase: any, entityId: string, status: string, phone: string | null): Promise<void> {
  await supabase.from("whatsapp_notification_log").insert({
    entity_type: "daily_record",
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
    const { daily_record_id, new_status, observacao } = await req.json();

    if (!daily_record_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "daily_record_id and new_status are required" }),
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

    const MABBIX_BACKEND_URL = Deno.env.get("MABBIX_BACKEND_URL")?.replace("//chat.mabbix.com.br", "//apichat.mabbix.com.br");
    const MABBIX_CONNECTION_TOKEN = Deno.env.get("MABBIX_CONNECTION_TOKEN");

    if (!MABBIX_BACKEND_URL || !MABBIX_CONNECTION_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Mabbix API not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // DEDUP: se a última notificação desse atendimento já foi esse mesmo status, não reenvia.
    if (await alreadyNotified(supabase, daily_record_id, new_status)) {
      console.log(`Skip duplicate daily record notification (status: ${new_status})`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "duplicate status" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: record, error: recordError } = await supabase
      .from("daily_service_records")
      .select("ticket_id, company_id, titulo, descricao, solucao, asset_id, tecnico_id")
      .eq("id", daily_record_id)
      .single();

    if (recordError || !record) {
      console.error("Daily record not found:", recordError);
      return new Response(
        JSON.stringify({ error: "Daily record not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let phone: string | null = null;
    let contactName: string | null = null;

    if (record.ticket_id) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("solicitante_contato, solicitante_nome, numero")
        .eq("id", record.ticket_id)
        .single();

      if (ticket?.solicitante_contato) {
        phone = formatPhone(ticket.solicitante_contato);
        contactName = ticket.solicitante_nome;
      }
    }

    if (!phone && record.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("whatsapp, telefone, nome_fantasia")
        .eq("id", record.company_id)
        .single();

      if (company) {
        contactName = contactName || company.nome_fantasia;
        if (company.whatsapp) {
          phone = formatPhone(company.whatsapp);
        }
        if (!phone && company.telefone) {
          phone = formatPhone(company.telefone);
        }
      }
    }

    if (!phone && record.company_id) {
      const { data: contacts } = await supabase
        .from("whatsapp_contacts")
        .select("phone_number, contact_name")
        .eq("company_id", record.company_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);

      if (contacts && contacts.length > 0) {
        phone = contacts[0].phone_number;
        contactName = contactName || contacts[0].contact_name;
      }
    }

    if (!phone) {
      console.log("No valid phone number found for daily record notification. company_id:", record.company_id, "ticket_id:", record.ticket_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: "No valid phone number found" }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let tecnico: { nome: string } | null = null;
    if (record.tecnico_id) {
      const { data } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", record.tecnico_id)
        .single();
      tecnico = data;
    }

    let equipamentoLabel: string | null = null;
    if (record.asset_id) {
      const { data: asset } = await supabase
        .from("assets")
        .select("nome, modelo, tag_patrimonial")
        .eq("id", record.asset_id)
        .single();
      if (asset) {
        equipamentoLabel = asset.nome;
        if (asset.modelo) equipamentoLabel += ` (${asset.modelo})`;
        if (asset.tag_patrimonial) equipamentoLabel += ` - Patrimônio: ${asset.tag_patrimonial}`;
      }
    }

    const now = new Date();
    const dataHora = now.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    let message = messageTemplate;
    message += `\n\n━━━━━━━━━━━━━━━━━━━`;
    message += `\n📋 *Serviço:* ${record.titulo}`;

    if (contactName) {
      message += `\n🏢 *Empresa:* ${contactName}`;
    }

    if (equipamentoLabel) {
      message += `\n🖥️ *Equipamento:* ${equipamentoLabel}`;
    }

    if (tecnico?.nome) {
      message += `\n👨‍💻 *Técnico:* ${tecnico.nome}`;
    }

    message += `\n📅 *Data/Hora:* ${dataHora}`;

    if (record.descricao) {
      message += `\n\n📝 *Descrição:*\n${record.descricao}`;
    }

    if (new_status === "concluido" && (observacao || record.solucao)) {
      message += `\n\n✅ *Solução Aplicada:*\n${observacao || record.solucao}`;
    }

    message += `\n\n━━━━━━━━━━━━━━━━━━━`;
    message += `\n_Conexão Virtual Soluções Tecnológicas_`;
    message += `\n_Este é um comprovante automático de atendimento._`;

    console.log(`Sending daily record notification to ${phone} (status: ${new_status})`);

    const response = await fetch(`${MABBIX_BACKEND_URL}/api/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MABBIX_CONNECTION_TOKEN}`,
      },
      body: JSON.stringify({
        number: phone,
        openTicket: "0",
        queueId: "0",
        body: message,
      }),
    });

    const result = await response.json();
    console.log("Mabbix notification response:", JSON.stringify(result).substring(0, 300));

    // Registra no log para deduplicação das próximas chamadas.
    await logNotification(supabase, daily_record_id, new_status, phone);

    return new Response(
      JSON.stringify({ success: true, phone, status: new_status }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("notify-daily-record-status error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
