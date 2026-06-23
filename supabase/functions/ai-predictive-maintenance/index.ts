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
    const { company_id } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar ativos com histórico de problemas
    let assetsQuery = supabase
      .from('assets')
      .select(`
        id, nome, tipo, fabricante, modelo, data_compra, garantia_fim, estado,
        companies(id, nome_fantasia)
      `)
      .eq('estado', 'em_uso');

    if (company_id) {
      assetsQuery = assetsQuery.eq('company_id', company_id);
    }

    const { data: assets, error: assetsError } = await assetsQuery.limit(100);

    if (assetsError) throw assetsError;

    // Para cada ativo, buscar histórico de problemas
    const assetsWithHistory: any[] = [];
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    for (const asset of (assets || [])) {
      // Contar tickets do ativo
      const { data: tickets, count: ticketCount } = await supabase
        .from('tickets')
        .select('id, titulo, descricao, created_at, prioridade', { count: 'exact' })
        .eq('asset_id', asset.id)
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: false });

      // Contar atendimentos do ativo
      const { count: serviceCount } = await supabase
        .from('daily_service_records')
        .select('id', { count: 'exact', head: true })
        .eq('asset_id', asset.id)
        .gte('data_atendimento', sixMonthsAgo.toISOString().split('T')[0]);

      const totalIncidents = (ticketCount || 0) + (serviceCount || 0);

      // Considerar ativos com pelo menos 2 incidentes nos últimos 6 meses
      if (totalIncidents >= 2) {
        assetsWithHistory.push({
          ...asset,
          incidentes_6m: totalIncidents,
          ultimos_tickets: (tickets || []).slice(0, 5).map(t => ({
            titulo: t.titulo,
            descricao: t.descricao?.substring(0, 100),
            data: t.created_at,
            prioridade: t.prioridade
          })),
          idade_meses: asset.data_compra 
            ? Math.floor((Date.now() - new Date(asset.data_compra).getTime()) / (1000 * 60 * 60 * 24 * 30))
            : null,
          garantia_ativa: asset.garantia_fim 
            ? new Date(asset.garantia_fim) > new Date()
            : null
        });
      }
    }

    if (assetsWithHistory.length === 0) {
      return new Response(JSON.stringify({
        previsoes: [],
        ativos_criticos: 0,
        ativos_atencao: 0,
        mensagem: 'Nenhum ativo com histórico significativo de problemas'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chamar OpenAI para análise preditiva
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
            content: `Você é um especialista em manutenção preditiva de TI.
Analise o histórico de cada ativo e preveja falhas nos próximos 30 dias.

Considere:
- Frequência de incidentes
- Tipo de equipamento
- Idade do equipamento
- Padrões nos problemas anteriores
- Status da garantia

Responda SEMPRE em JSON válido:
{
  "previsoes": [
    {
      "asset_id": "uuid",
      "asset_nome": "nome",
      "company_nome": "empresa",
      "probabilidade_falha": 75,
      "tipo_falha_prevista": "Tipo provável de falha",
      "dias_estimados": 15,
      "historico_resumo": "Resumo do histórico",
      "recomendacao": "Ação preventiva sugerida"
    }
  ],
  "ativos_criticos": 2,
  "ativos_atencao": 5
}

Ordene por probabilidade de falha (maior primeiro).
Probabilidade crítica: >= 70%, Atenção: 40-69%`
          },
          {
            role: "user",
            content: `Analise estes ativos e preveja falhas:

${JSON.stringify(assetsWithHistory.map(a => ({
  asset_id: a.id,
  nome: a.nome,
  tipo: a.tipo,
  fabricante: a.fabricante,
  modelo: a.modelo,
  empresa: a.companies?.nome_fantasia,
  incidentes_6m: a.incidentes_6m,
  idade_meses: a.idade_meses,
  garantia_ativa: a.garantia_ativa,
  ultimos_problemas: a.ultimos_tickets
})), null, 2)}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    let predictionsResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        predictionsResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      // Fallback: gerar previsões básicas baseadas em frequência
      predictionsResult = {
        previsoes: assetsWithHistory.slice(0, 10).map(a => ({
          asset_id: a.id,
          asset_nome: a.nome,
          company_nome: a.companies?.nome_fantasia,
          probabilidade_falha: Math.min(100, a.incidentes_6m * 15),
          tipo_falha_prevista: 'Falha recorrente baseada em histórico',
          dias_estimados: 30,
          historico_resumo: `${a.incidentes_6m} incidentes nos últimos 6 meses`,
          recomendacao: 'Agendar manutenção preventiva'
        })),
        ativos_criticos: assetsWithHistory.filter(a => a.incidentes_6m >= 5).length,
        ativos_atencao: assetsWithHistory.filter(a => a.incidentes_6m >= 3 && a.incidentes_6m < 5).length
      };
    }

    // Salvar previsões no banco para cache
    const validoAte = new Date();
    validoAte.setDate(validoAte.getDate() + 7); // Cache válido por 7 dias

    for (const previsao of (predictionsResult.previsoes || [])) {
      // Verificar se já existe previsão para este ativo
      const { data: existing } = await supabase
        .from('ai_predictions')
        .select('id')
        .eq('asset_id', previsao.asset_id)
        .gte('valido_ate', new Date().toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('ai_predictions').insert({
          asset_id: previsao.asset_id,
          probabilidade_falha: previsao.probabilidade_falha,
          tipo_falha_prevista: previsao.tipo_falha_prevista,
          dias_estimados: previsao.dias_estimados,
          historico_resumo: previsao.historico_resumo,
          recomendacao: previsao.recomendacao,
          valido_ate: validoAte.toISOString()
        });
      }
    }

    console.log('[ai-predictive-maintenance] Previsões geradas:', predictionsResult.previsoes?.length || 0);

    return new Response(JSON.stringify(predictionsResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-predictive-maintenance] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
