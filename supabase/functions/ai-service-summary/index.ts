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
    const { service_type, service_id } = await req.json();
    
    if (!service_type || !service_id) {
      throw new Error('service_type and service_id are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let serviceData: any = null;
    let historicalData: any[] = [];

    if (service_type === 'ticket') {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo),
          profiles!tickets_tecnico_id_fkey(nome)
        `)
        .eq('id', service_id)
        .single();

      if (error || !ticket) throw new Error('Ticket não encontrado');
      serviceData = ticket;

      // Buscar histórico de tickets do mesmo ativo/empresa
      const { data: history } = await supabase
        .from('tickets')
        .select('titulo, descricao, solucao, created_at')
        .eq('company_id', ticket.company_id)
        .in('status', ['resolvido', 'fechado'])
        .not('solucao', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      historicalData = history || [];

    } else if (service_type === 'daily_service') {
      const { data: record, error } = await supabase
        .from('daily_service_records')
        .select(`
          *,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo),
          profiles!daily_service_records_tecnico_id_fkey(nome)
        `)
        .eq('id', service_id)
        .single();

      if (error || !record) throw new Error('Registro de atendimento não encontrado');
      serviceData = record;

      // Buscar histórico de atendimentos do mesmo ativo/empresa
      const { data: history } = await supabase
        .from('daily_service_records')
        .select('titulo, descricao, solucao, created_at')
        .eq('company_id', record.company_id)
        .eq('status', 'concluido')
        .not('solucao', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      historicalData = history || [];
    } else {
      throw new Error('Tipo de serviço inválido');
    }

    // Preparar contexto para IA
    const context = {
      atendimento: {
        titulo: serviceData.titulo,
        descricao: serviceData.descricao,
        solucao: serviceData.solucao,
        empresa: serviceData.companies?.nome_fantasia,
        ativo: serviceData.assets ? `${serviceData.assets.tipo} - ${serviceData.assets.nome}` : null,
        tecnico: serviceData.profiles?.nome
      },
      historico: historicalData.map(h => ({
        titulo: h.titulo,
        problema: h.descricao?.substring(0, 150),
        solucao: h.solucao?.substring(0, 200)
      }))
    };

    // Chamar OpenAI
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
            content: `Você é um assistente especializado em documentação de atendimentos de TI.
Analise o atendimento e gere um resumo executivo completo.

Responda SEMPRE em JSON válido com a estrutura:
{
  "resumo_executivo": "Resumo claro e objetivo do atendimento (máx 200 palavras)",
  "problema_identificado": "Descrição técnica do problema",
  "solucao_aplicada": "Descrição da solução implementada",
  "tempo_estimado_futuro": "Estimativa de tempo caso o problema se repita",
  "padrao_detectado": true/false,
  "recomendacao_preventiva": "Ação preventiva sugerida ou null",
  "tags_sugeridas": ["tag1", "tag2"]
}`
          },
          {
            role: "user",
            content: `Gere um resumo executivo deste atendimento:

ATENDIMENTO:
Título: ${context.atendimento.titulo}
Descrição do Problema: ${context.atendimento.descricao}
Solução Aplicada: ${context.atendimento.solucao || 'Não informada'}
Empresa: ${context.atendimento.empresa}
Ativo: ${context.atendimento.ativo || 'Não especificado'}
Técnico: ${context.atendimento.tecnico}

HISTÓRICO DE ATENDIMENTOS ANTERIORES (para identificar padrões):
${JSON.stringify(context.historico, null, 2)}`
          }
        ],
        temperature: 0.4,
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

    // Parse da resposta da IA
    let summaryResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      summaryResult = {
        resumo_executivo: `Atendimento realizado: ${serviceData.titulo}. ${serviceData.solucao || 'Solução não documentada.'}`,
        problema_identificado: serviceData.descricao?.substring(0, 200) || 'Não especificado',
        solucao_aplicada: serviceData.solucao || 'Não documentada',
        tempo_estimado_futuro: 'Não estimado',
        padrao_detectado: false,
        recomendacao_preventiva: null,
        tags_sugeridas: []
      };
    }

    console.log('[ai-service-summary] Resumo gerado para:', service_type, service_id);

    return new Response(JSON.stringify(summaryResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-service-summary] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
