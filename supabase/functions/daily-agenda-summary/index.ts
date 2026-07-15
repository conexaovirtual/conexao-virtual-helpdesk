import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";
const JOSE_PHONE = "5562984515801";

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

    // Today in BRT (UTC-3)
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const today = brt.toISOString().split("T")[0];
    const yesterday = new Date(brt.getTime() - 86400000).toISOString().split("T")[0];

    console.log(`Daily agenda summary for: ${today}`);

    // Fetch all data in parallel
    const [osResult, ticketsResult, visitsResult, dailyResult, newOsResult] = await Promise.all([
      // Service orders scheduled for today
      supabase
        .from("service_orders")
        .select("numero_os, descricao_servicos, status, prioridade, data_agendada, hora_agendada, modalidade, tipo_servico, companies:company_id(nome_fantasia)")
        .gte("data_agendada", `${today}T00:00:00`)
        .lte("data_agendada", `${today}T23:59:59`)
        .order("hora_agendada"),
      // Open tickets
      supabase
        .from("tickets")
        .select("numero, titulo, status, prioridade, urgencia, created_at, sla_solucao_limite, companies:company_id(nome_fantasia)")
        .in("status", ["novo", "em_atendimento"])
        .order("prioridade")
        .limit(20),
      // Visit schedules for today
      supabase
        .from("visit_schedules")
        .select("proxima_visita, motivo, status, prioridade, observacoes, companies:company_id(nome_fantasia)")
        .eq("proxima_visita", today)
        .eq("status", "pendente"),
      // Daily records already registered today
      supabase
        .from("daily_service_records")
        .select("titulo, status, hora_inicio, canal, companies:company_id(nome_fantasia)")
        .eq("data_atendimento", today),
      // New OS created yesterday
      supabase
        .from("service_orders")
        .select("numero_os, descricao_servicos, prioridade, companies:company_id(nome_fantasia)")
        .gte("created_at", `${yesterday}T00:00:00`)
        .lte("created_at", `${yesterday}T23:59:59`),
    ]);

    const os = osResult.data || [];
    const tickets = ticketsResult.data || [];
    const visits = visitsResult.data || [];
    const daily = dailyResult.data || [];
    const newOs = newOsResult.data || [];

    // Check SLA risks
    const slaRisks = tickets.filter((t: any) => {
      if (!t.sla_solucao_limite) return false;
      const slaDate = new Date(t.sla_solucao_limite);
      const hoursRemaining = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursRemaining > 0 && hoursRemaining < 8;
    });

    // Build context for AI summary
    const contextData = {
      data: today,
      os_agendadas: os.map((o: any) => ({
        numero: o.numero_os,
        hora: o.hora_agendada?.substring(0, 5) || "sem horário",
        empresa: o.companies?.nome_fantasia || "N/A",
        tipo: o.tipo_servico || "corretivo",
        modalidade: o.modalidade || "presencial",
        prioridade: o.prioridade,
        status: o.status,
        descricao: o.descricao_servicos?.substring(0, 100),
      })),
      chamados_abertos: tickets.map((t: any) => ({
        numero: t.numero,
        titulo: t.titulo,
        empresa: t.companies?.nome_fantasia || "N/A",
        urgencia: t.urgencia,
        prioridade: t.prioridade,
        status: t.status,
      })),
      visitas_do_dia: visits.map((v: any) => ({
        empresa: v.companies?.nome_fantasia || "N/A",
        motivo: v.motivo,
        prioridade: v.prioridade,
        observacoes: v.observacoes?.substring(0, 80),
      })),
      atendimentos_registrados: daily.map((d: any) => ({
        titulo: d.titulo,
        empresa: d.companies?.nome_fantasia || "N/A",
        hora: d.hora_inicio?.substring(0, 5),
        status: d.status,
        canal: d.canal,
      })),
      novas_os_ontem: newOs.map((o: any) => ({
        numero: o.numero_os,
        empresa: o.companies?.nome_fantasia || "N/A",
        descricao: o.descricao_servicos?.substring(0, 80),
        prioridade: o.prioridade,
      })),
      riscos_sla: slaRisks.map((t: any) => ({
        numero: t.numero,
        titulo: t.titulo,
        empresa: t.companies?.nome_fantasia || "N/A",
        limite_sla: t.sla_solucao_limite,
      })),
    };

    // Generate AI summary
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você gera resumos diários de agenda para o técnico José Pereira da Conexão Virtual.
Formato OBRIGATÓRIO (WhatsApp, use *negrito* e emojis):

📋 *Resumo do Dia - DD/MM/AAAA*

📅 *Agenda de Atendimentos (X itens):*
• HH:MM - OS #NNN - Empresa (Tipo, modalidade)
...

🎫 *Chamados Abertos (X):*
• #NNN - Título - Empresa (urgência)
...

🔔 *Novas OS Abertas Ontem (X):*
• OS #NNN - Empresa - Descrição
...

⚠️ *Riscos de SLA (X):*
• #NNN - Empresa - vence em Xh
...

💡 *Recomendação IA:*
Uma frase priorizando o dia com base nos dados.

Regras:
- Seja conciso e direto
- Priorize por urgência/SLA
- Se não há itens numa seção, escreva "Nenhum."
- Máximo 1500 caracteres total`,
          },
          {
            role: "user",
            content: `Gere o resumo diário com base nestes dados:\n${JSON.stringify(contextData, null, 2)}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    let summary = aiResult.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      // Fallback: build manual summary
      const dateFormatted = `${today.split("-")[2]}/${today.split("-")[1]}/${today.split("-")[0]}`;
      summary = `📋 *Resumo do Dia - ${dateFormatted}*\n\n`;
      summary += `📅 *OS Agendadas (${os.length}):*\n`;
      if (os.length === 0) summary += "Nenhuma.\n";
      else os.forEach((o: any) => {
        summary += `• ${o.hora_agendada?.substring(0, 5) || "--:--"} - OS #${o.numero_os} - ${o.companies?.nome_fantasia || "N/A"} (${o.modalidade})\n`;
      });
      summary += `\n🎫 *Chamados Abertos (${tickets.length}):*\n`;
      if (tickets.length === 0) summary += "Nenhum.\n";
      else tickets.slice(0, 10).forEach((t: any) => {
        summary += `• #${t.numero} - ${t.titulo} (${t.urgencia})\n`;
      });
    }

    // Send via Mabbix WhatsApp
    console.log("Sending daily summary to Jose:", summary.substring(0, 200));

    const sendResult = await sendWabaText(JOSE_PHONE, summary, { openTicket: false });
    console.log("Summary sent:", JSON.stringify(sendResult.raw).substring(0, 200));

    return new Response(JSON.stringify({ success: true, summary_length: summary.length }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Daily agenda summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
