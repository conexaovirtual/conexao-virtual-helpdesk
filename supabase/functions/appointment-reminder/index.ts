import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsApp(phone: string, text: string): Promise<{ ok: boolean; error?: string; status?: number; body?: string }> {
  const rawUrl = Deno.env.get("MABBIX_URL") || Deno.env.get("MABBIX_BACKEND_URL");
  const MABBIX_CONNECTION_TOKEN = Deno.env.get("MABBIX_TOKEN") || Deno.env.get("MABBIX_CONNECTION_TOKEN");

  if (!rawUrl || !MABBIX_CONNECTION_TOKEN) {
    return { ok: false, error: "Mabbix não configurado" };
  }

  // Garante o host apichat sem duplicar "api" se o segredo já vier como apichat.*
  const MABBIX_BACKEND_URL = rawUrl.includes("apichat.mabbix.com.br")
    ? rawUrl
    : rawUrl.replace("chat.mabbix.com.br", "apichat.mabbix.com.br");
  const url = `${MABBIX_BACKEND_URL}/api/messages/send`;
  const payload = { number: phone, openTicket: "0", queueId: "0", body: text };
  console.log(`Enviando para Mabbix: ${url}`, JSON.stringify(payload));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MABBIX_CONNECTION_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log(`Mabbix response status: ${res.status}`, responseText.substring(0, 300));

    if (!res.ok) {
      return { ok: false, status: res.status, body: responseText };
    }

    console.log(`✅ WhatsApp enviado para ${phone}`);
    return { ok: true };
  } catch (err: any) {
    console.error("Erro ao enviar WhatsApp:", err);
    return { ok: false, error: err.message };
  }
}

function typeEmoji(type: string): string {
  const map: Record<string, string> = {
    reuniao: "👥", ligacao: "📞", visita: "🚗", compromisso: "📌", outro: "📋",
  };
  return map[type] || "📌";
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    reuniao: "Reunião", ligacao: "Ligação", visita: "Visita", compromisso: "Compromisso", outro: "Outro",
  };
  return map[type] || "Compromisso";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawMabbixUrl = Deno.env.get("MABBIX_URL") || Deno.env.get("MABBIX_BACKEND_URL");
    const MABBIX_BACKEND_URL = rawMabbixUrl?.includes("apichat.mabbix.com.br")
      ? rawMabbixUrl
      : rawMabbixUrl?.replace("chat.mabbix.com.br", "apichat.mabbix.com.br");
    const MABBIX_CONNECTION_TOKEN = Deno.env.get("MABBIX_TOKEN") || Deno.env.get("MABBIX_CONNECTION_TOKEN");

    if (!MABBIX_BACKEND_URL || !MABBIX_CONNECTION_TOKEN) {
      return new Response(JSON.stringify({ error: "Mabbix não configurado" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const today = brt.toISOString().split("T")[0];
    const currentHour = brt.getHours();
    const currentMinute = brt.getMinutes();

    let body: any = {};
    try { body = await req.json(); } catch { /* GET request */ }
    const mode: string = body.mode || "reminder";
    const forcePhone: string | null = body.phone || null;

    console.log(`appointment-reminder mode=${mode} BRT=${brt.toISOString()}`);

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, user_id, title, description, appointment_date, appointment_time, end_time, type, notify_minutes, status")
      .eq("appointment_date", today)
      .eq("status", "agendado")
      .order("appointment_time");

    if (error) throw error;
    if (!appointments || appointments.length === 0) {
      console.log("Nenhum compromisso hoje.");
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "Nenhum compromisso hoje" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userIds = [...new Set(appointments.map((a: any) => a.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome, telefone")
      .in("id", userIds);

    const phoneMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => {
      if (p.telefone) {
        const clean = p.telefone.replace(/\D/g, "");
        phoneMap[p.id] = clean.startsWith("55") ? clean : `55${clean}`;
      }
    });

    let totalSent = 0;
    const results: any[] = [];

    const byUser: Record<string, any[]> = {};
    for (const appt of appointments) {
      if (!byUser[appt.user_id]) byUser[appt.user_id] = [];
      byUser[appt.user_id].push(appt);
    }

    for (const [userId, userAppts] of Object.entries(byUser)) {
      const phone = forcePhone || phoneMap[userId];
      if (!phone) {
        console.warn(`Sem telefone para usuário ${userId}`);
        continue;
      }

      if (mode === "summary" || (mode === "auto" && currentHour === 8 && currentMinute < 15)) {
        const lines = userAppts.map((a: any) => {
          const emoji = typeEmoji(a.type);
          const time = a.appointment_time ? a.appointment_time.substring(0, 5) : "sem horário";
          const desc = a.description ? `\n   📝 ${a.description}` : "";
          return `${emoji} *${a.title}*\n   🕐 ${time}${desc}`;
        }).join("\n\n");

        const msg = `📅 *Agenda de hoje — ${today.split("-").reverse().join("/")}*\n\nVocê tem ${userAppts.length} compromisso${userAppts.length > 1 ? "s" : ""} hoje:\n\n${lines}\n\n_Conexão Virtual — Agenda Inteligente_ 🚀`;

        const result = await sendWhatsApp(phone, msg);
        if (result.ok) totalSent++;
        results.push({ userId, phone, mode: "summary", ok: result.ok, mabbixError: result.error, mabbixStatus: result.status, mabbixBody: result.body });
      }

      if (mode === "reminder" || mode === "auto" || mode === "test") {
        for (const appt of userAppts) {
          if (!appt.appointment_time) continue;

          const [h, m] = appt.appointment_time.split(":").map(Number);
          const apptMinutes = h * 60 + m;
          const nowMinutes = currentHour * 60 + currentMinute;
          const minutesUntil = apptMinutes - nowMinutes;
          const notifyAt = appt.notify_minutes ?? 15;

          // Janela de recuperação: envia em qualquer execução entre o horário do
          // aviso e o início do compromisso, para que um cron atrasado ou esparso
          // não perca o lembrete. O log de notificações garante envio único.
          const shouldSend = mode === "test"
            ? true
            : (minutesUntil >= 0 && minutesUntil <= notifyAt);

          if (!shouldSend) continue;

          const { data: alreadySent } = await supabase
            .from("appointment_notification_log")
            .select("id")
            .eq("appointment_id", appt.id)
            .eq("channel", "whatsapp")
            .maybeSingle();

          if (alreadySent && mode !== "test") {
            console.log(`Já notificado: ${appt.id}`);
            continue;
          }

          const emoji = typeEmoji(appt.type);
          const tipo = typeLabel(appt.type);
          const time = appt.appointment_time.substring(0, 5);
          const endTime = appt.end_time ? ` até ${appt.end_time.substring(0, 5)}` : "";
          const desc = appt.description ? `\n📝 ${appt.description}` : "";
          const timing = minutesUntil <= 2 ? "Agora!" : `Em ${minutesUntil} minutos`;

          const msg = `⏰ *Lembrete de ${tipo}*\n\n${emoji} *${appt.title}*\n🕐 ${time}${endTime}${desc}\n\n🔔 ${timing}\n\n_Conexão Virtual — Agenda Inteligente_`;

          const result = await sendWhatsApp(phone, msg);

          if (result.ok && mode !== "test") {
            await supabase.from("appointment_notification_log").insert({
              appointment_id: appt.id,
              user_id: userId,
              channel: "whatsapp",
              sent_at: new Date().toISOString(),
            });
          }

          if (result.ok) totalSent++;
          results.push({ userId, phone, appointmentId: appt.id, title: appt.title, mode: "reminder", minutesUntil, ok: result.ok, mabbixError: result.error, mabbixStatus: result.status, mabbixBody: result.body });
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent, results }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err: any) {
    console.error("appointment-reminder error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
