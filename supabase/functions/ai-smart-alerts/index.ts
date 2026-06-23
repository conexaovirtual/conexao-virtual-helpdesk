import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();

    // 1. Buscar tickets em risco de SLA
    const { data: slaRiskTickets } = await supabase
      .from('tickets')
      .select('id, numero, titulo, sla_solucao_limite, company_id, companies(nome_fantasia)')
      .in('status', ['novo', 'triagem', 'em_atendimento', 'aguardando_usuario'])
      .not('sla_solucao_limite', 'is', null)
      .order('sla_solucao_limite', { ascending: true })
      .limit(50);

    const ticketsInSlaRisk = (slaRiskTickets || []).filter(t => {
      if (!t.sla_solucao_limite) return false;
      const limite = new Date(t.sla_solucao_limite);
      const hoursLeft = (limite.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursLeft <= 4 && hoursLeft > 0; // Menos de 4 horas para vencer
    });

    const ticketsSlaViolated = (slaRiskTickets || []).filter(t => {
      if (!t.sla_solucao_limite) return false;
      const limite = new Date(t.sla_solucao_limite);
      return limite.getTime() < now.getTime();
    });

    // 2. Buscar carga de trabalho dos técnicos
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin_provedor', 'tecnico']);

    let technicianWorkload: any[] = [];
    if (roles) {
      for (const role of roles) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, nome')
          .eq('id', role.user_id)
          .single();

        const { count: activeTickets } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('tecnico_id', role.user_id)
          .in('status', ['em_atendimento', 'triagem', 'aguardando_usuario']);

        const { count: scheduledOS } = await supabase
          .from('service_orders')
          .select('id', { count: 'exact', head: true })
          .eq('tecnico_id', role.user_id)
          .in('status', ['agendada', 'confirmada']);

        if (profile) {
          technicianWorkload.push({
            id: profile.id,
            nome: profile.nome,
            chamados_ativos: activeTickets || 0,
            os_agendadas: scheduledOS || 0,
            carga_total: (activeTickets || 0) + (scheduledOS || 0)
          });
        }
      }
    }

    const overloadedTechnicians = technicianWorkload.filter(t => t.carga_total >= 10);

    // 3. Empresas sem atendimento recente (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: companies } = await supabase
      .from('companies')
      .select('id, nome_fantasia, tipo_contrato')
      .eq('status', true)
      .eq('tipo_contrato', 'contrato_manutencao');

    let neglectedCompanies: any[] = [];
    for (const company of (companies || [])) {
      const { data: recentServices } = await supabase
        .from('daily_service_records')
        .select('id')
        .eq('company_id', company.id)
        .gte('data_atendimento', thirtyDaysAgo.toISOString().split('T')[0])
        .limit(1);

      if (!recentServices || recentServices.length === 0) {
        neglectedCompanies.push(company);
      }
    }

    // 4. Padrões anormais - muitos tickets da mesma empresa
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentTickets } = await supabase
      .from('tickets')
      .select('company_id, companies(nome_fantasia)')
      .gte('created_at', sevenDaysAgo.toISOString());

    const ticketsByCompany: Record<string, { count: number; nome: string }> = {};
    for (const ticket of (recentTickets || [])) {
      if (!ticketsByCompany[ticket.company_id]) {
        ticketsByCompany[ticket.company_id] = { 
          count: 0, 
          nome: (ticket.companies as any)?.nome_fantasia || 'Desconhecida' 
        };
      }
      ticketsByCompany[ticket.company_id].count++;
    }

    const abnormalPatterns = Object.entries(ticketsByCompany)
      .filter(([_, v]) => v.count >= 5)
      .map(([id, v]) => ({ company_id: id, ...v }));

    // Preparar dados para IA analisar
    const analysisData = {
      sla_risk: ticketsInSlaRisk.length,
      sla_violated: ticketsSlaViolated.length,
      overloaded_technicians: overloadedTechnicians.length,
      neglected_companies: neglectedCompanies.length,
      abnormal_patterns: abnormalPatterns.length,
      details: {
        sla_risk_tickets: ticketsInSlaRisk.slice(0, 3),
        overloaded: overloadedTechnicians,
        neglected: neglectedCompanies.slice(0, 5),
        patterns: abnormalPatterns
      }
    };

    // Chamar OpenAI para gerar alertas inteligentes
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é um assistente de análise de helpdesk que gera alertas inteligentes.
Analise os dados e gere alertas relevantes.

Responda SEMPRE em JSON válido:
{
  "alertas": [
    {
      "tipo": "sla_risco|tecnico_sobrecarga|padrao_anormal|empresa_atencao",
      "severidade": "alta|media|baixa",
      "titulo": "Título curto do alerta",
      "descricao": "Descrição detalhada",
      "dados": { dados_relevantes },
      "acao_sugerida": "O que fazer"
    }
  ],
  "resumo": "Resumo geral da situação"
}`
          },
          {
            role: "user",
            content: `Analise estes dados e gere alertas relevantes:

DADOS ATUAIS:
${JSON.stringify(analysisData, null, 2)}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429 || aiResponse.status === 402) {
        // Gerar alertas básicos sem IA
        const basicAlerts = [];
        
        if (ticketsSlaViolated.length > 0) {
          basicAlerts.push({
            tipo: 'sla_risco',
            severidade: 'alta',
            titulo: `${ticketsSlaViolated.length} SLAs violados`,
            descricao: `Existem ${ticketsSlaViolated.length} chamados com SLA já vencido`,
            dados: { tickets: ticketsSlaViolated.slice(0, 3) },
            acao_sugerida: 'Priorize estes chamados imediatamente'
          });
        }

        if (overloadedTechnicians.length > 0) {
          basicAlerts.push({
            tipo: 'tecnico_sobrecarga',
            severidade: 'media',
            titulo: `${overloadedTechnicians.length} técnicos sobrecarregados`,
            descricao: `Técnicos com mais de 10 tarefas ativas`,
            dados: { tecnicos: overloadedTechnicians },
            acao_sugerida: 'Redistribuir carga de trabalho'
          });
        }

        return new Response(JSON.stringify({
          alertas: basicAlerts,
          resumo: 'Análise básica gerada sem IA'
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    let alertsResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        alertsResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      alertsResult = {
        alertas: [],
        resumo: 'Não foi possível gerar alertas estruturados'
      };
    }

    // Salvar alertas no banco
    for (const alerta of (alertsResult.alertas || [])) {
      await supabase.from('ai_alerts').insert({
        tipo: alerta.tipo,
        severidade: alerta.severidade,
        titulo: alerta.titulo,
        descricao: alerta.descricao,
        dados: alerta.dados,
        acao_sugerida: alerta.acao_sugerida
      });
    }

    console.log('[ai-smart-alerts] Alertas gerados:', alertsResult.alertas?.length || 0);

    return new Response(JSON.stringify(alertsResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-smart-alerts] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
