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
    const { contexto, pergunta } = await req.json();
    
    if (!pergunta) {
      throw new Error('pergunta is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let serviceContext = '';
    let historicalSolutions: any[] = [];

    // Buscar contexto do ticket
    if (contexto?.ticket_id) {
      const { data: ticket } = await supabase
        .from('tickets')
        .select(`
          titulo, descricao, company_id,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo, sistema_operacional, configuracoes)
        `)
        .eq('id', contexto.ticket_id)
        .single();

      if (ticket) {
        const ticketCompany = ticket.companies as any;
        const ticketAsset = ticket.assets as any;
        
        serviceContext = `
CHAMADO ATUAL:
Título: ${ticket.titulo}
Descrição: ${ticket.descricao}
Empresa: ${ticketCompany?.nome_fantasia}
${ticketAsset ? `Ativo: ${ticketAsset.tipo} - ${ticketAsset.fabricante} ${ticketAsset.modelo}
Sistema: ${ticketAsset.sistema_operacional || 'N/A'}` : ''}`;

        // Buscar soluções anteriores
        const { data: solutions } = await supabase
          .from('tickets')
          .select('titulo, descricao, solucao')
          .eq('company_id', contexto.company_id || ticket.company_id)
          .in('status', ['resolvido', 'fechado'])
          .not('solucao', 'is', null)
          .order('created_at', { ascending: false })
          .limit(15);

        historicalSolutions = solutions || [];
      }
    }

    // Buscar contexto do atendimento diário
    if (contexto?.daily_service_id) {
      const { data: record } = await supabase
        .from('daily_service_records')
        .select(`
          titulo, descricao,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo, sistema_operacional, configuracoes)
        `)
        .eq('id', contexto.daily_service_id)
        .single();

      if (record) {
        const recordCompany = record.companies as any;
        const recordAsset = record.assets as any;
        
        serviceContext = `
ATENDIMENTO ATUAL:
Título: ${record.titulo}
Descrição: ${record.descricao}
Empresa: ${recordCompany?.nome_fantasia}
${recordAsset ? `Ativo: ${recordAsset.tipo} - ${recordAsset.fabricante} ${recordAsset.modelo}
Sistema: ${recordAsset.sistema_operacional || 'N/A'}` : ''}`;
      }
    }

    // Se tiver descrição do problema direta
    if (contexto?.descricao_problema) {
      serviceContext += `\nPROBLEMA DESCRITO: ${contexto.descricao_problema}`;
    }

    // Buscar informações do ativo
    if (contexto?.asset_id) {
      const { data: asset } = await supabase
        .from('assets')
        .select('tipo, nome, fabricante, modelo, sistema_operacional, configuracoes, observacoes')
        .eq('id', contexto.asset_id)
        .single();

      if (asset) {
        serviceContext += `
INFORMAÇÕES DO ATIVO:
Tipo: ${asset.tipo}
Nome: ${asset.nome}
Fabricante/Modelo: ${asset.fabricante} ${asset.modelo}
Sistema Operacional: ${asset.sistema_operacional || 'N/A'}
Configurações: ${JSON.stringify(asset.configuracoes) || 'N/A'}
Observações: ${asset.observacoes || 'Nenhuma'}`;
      }
    }

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
            content: `Você é um assistente de diagnóstico técnico especializado em suporte de TI.
Ajude o técnico a diagnosticar e resolver problemas.

Suas respostas devem incluir:
1. Passos de diagnóstico claros e ordenados
2. Possíveis causas do problema
3. Soluções sugeridas baseadas no histórico
4. Comandos ou procedimentos técnicos quando aplicável

Responda SEMPRE em JSON válido:
{
  "resposta": "Resposta detalhada em markdown",
  "passos_diagnostico": [
    { "ordem": 1, "descricao": "Passo 1", "importante": true },
    { "ordem": 2, "descricao": "Passo 2", "importante": false }
  ],
  "solucoes_anteriores": [
    { "titulo": "Problema similar", "resumo": "Como foi resolvido", "data": "2024-01-01" }
  ],
  "nivel_confianca": "alto|medio|baixo"
}`
          },
          {
            role: "user",
            content: `CONTEXTO DO ATENDIMENTO:
${serviceContext}

HISTÓRICO DE SOLUÇÕES ANTERIORES:
${JSON.stringify(historicalSolutions.slice(0, 5), null, 2)}

PERGUNTA DO TÉCNICO:
${pergunta}`
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
    let diagnosticResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        diagnosticResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      diagnosticResult = {
        resposta: aiContent || 'Não foi possível gerar uma resposta estruturada.',
        passos_diagnostico: [],
        solucoes_anteriores: [],
        nivel_confianca: 'baixo'
      };
    }

    console.log('[ai-diagnostic-assistant] Diagnóstico gerado');

    return new Response(JSON.stringify(diagnosticResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-diagnostic-assistant] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
