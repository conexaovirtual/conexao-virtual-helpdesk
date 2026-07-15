import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TECNICO_PHONE = "5562999522470";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Janela do mês corrente (BRT ~ UTC-3, mas o corte por mês tolera a diferença)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
    const monthStartDate = monthStart.slice(0, 10);
    const nextMonthStartDate = nextMonthStart.slice(0, 10);

    // Clientes de contrato (visita mensal obrigatória)
    const { data: contratos } = await supabase
      .from("companies")
      .select("id, nome_fantasia")
      .eq("tipo_contrato", "contrato_manutencao")
      .eq("status", true);

    if (!contratos || contratos.length === 0) {
      return new Response(JSON.stringify({ ok: true, contratos: 0, sem_visita: 0 }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Empresas "cobertas" este mês: visita agendada, OS agendada ou atendimento registrado
    const [visitas, ordens, atendimentos] = await Promise.all([
      supabase.from("visit_schedules").select("company_id")
        .gte("proxima_visita", monthStartDate).lt("proxima_visita", nextMonthStartDate),
      supabase.from("service_orders").select("company_id")
        .gte("data_agendada", monthStart).lt("data_agendada", nextMonthStart),
      supabase.from("daily_service_records").select("company_id")
        .gte("data_atendimento", monthStartDate).lt("data_atendimento", nextMonthStartDate),
    ]);

    const cobertas = new Set<string>();
    for (const r of [...(visitas.data || []), ...(ordens.data || []), ...(atendimentos.data || [])]) {
      if (r.company_id) cobertas.add(r.company_id);
    }

    const semVisita = contratos.filter((c: any) => !cobertas.has(c.id));

    // Só notifica se houver pendência (mensagem acionável)
    if (semVisita.length > 0) {
      const mesNome = MESES[now.getUTCMonth()];
      const lista = semVisita.map((c: any) => `• ${c.nome_fantasia}`).join("\n");
      const msg =
        `🗓️ *Preventiva — clientes de contrato sem visita em ${mesNome}*\n\n` +
        `${semVisita.length} de ${contratos.length} ainda sem visita este mês:\n\n` +
        `${lista}\n\n` +
        `⚡ Agende as visitas na plataforma.`;
      await sendWabaText(TECNICO_PHONE, msg, { openTicket: false });
    }

    console.log(`Preventiva: ${semVisita.length}/${contratos.length} sem visita este mês`);
    return new Response(
      JSON.stringify({ ok: true, contratos: contratos.length, sem_visita: semVisita.length, empresas: semVisita.map((c: any) => c.nome_fantasia) }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    console.error("preventive-maintenance-check error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
