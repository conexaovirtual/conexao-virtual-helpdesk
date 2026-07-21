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
    const { ticket_id } = await req.json();
    
    if (!ticket_id) {
      throw new Error('ticket_id is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar dados do ticket atual
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select(`
        *,
        companies(nome_fantasia, tipo_contrato),
        assets(tipo, fabricante, modelo, nome)
      `)
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket não encontrado');
    }

    // Buscar tickets similares resolvidos
    const { data: similarTickets } = await supabase
      .from('tickets')
      .select('id, numero, titulo, descricao, solucao, prioridade, urgencia, created_at')
      .eq('company_id', ticket.company_id)
      .in('status', ['resolvido', 'fechado'])
      .not('solucao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    // Buscar técnicos disponíveis com histórico
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin_provedor', 'tecnico']);

    let techniciansWithHistory: any[] = [];
    
    if (roles && roles.length > 0) {
      const userIds = roles.map(r => r.user_id);
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nome')
        .in('id', userIds);

      // Contar atendimentos por técnico
      for (const profile of (profiles || [])) {
        const { count } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('tecnico_id', profile.id)
          .eq('company_id', ticket.company_id);

        const { count: activeCount } = await supabase
          .from('tickets')
          .select('id', { count: 'exact', head: true })
          .eq('tecnico_id', profile.id)
          .in('status', ['em_atendimento', 'triagem']);

        techniciansWithHistory.push({
          ...profile,
          atendimentos_empresa: count || 0,
          chamados_ativos: activeCount || 0
        });
      }
    }

    // Preparar contexto para IA
    const context = {
      ticket: {
        titulo: ticket.titulo,
        descricao: ticket.descricao,
        canal: ticket.canal,
        empresa: ticket.companies?.nome_fantasia,
        tipo_contrato: ticket.companies?.tipo_contrato,
        ativo: ticket.assets ? `${ticket.assets.tipo} - ${ticket.assets.fabricante} ${ticket.assets.modelo}` : null
      },
      tickets_similares: (similarTickets || []).map(t => ({
        titulo: t.titulo,
        descricao: t.descricao?.substring(0, 200),
        solucao: t.solucao?.substring(0, 300),
        prioridade: t.prioridade,
        urgencia: t.urgencia
      })),
      tecnicos: techniciansWithHistory.map(t => ({
        id: t.id,
        nome: t.nome,
        atendimentos_empresa: t.atendimentos_empresa,
        chamados_ativos: t.chamados_ativos
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
            content: `Você é um assistente especializado em triagem de chamados de suporte técnico em TI.
Analise o chamado e sugira:
1. Prioridade (critica, alta, media, baixa)
2. Urgência (alta, media, baixa)
3. O melhor técnico baseado no histórico (prefira quem já atendeu a empresa e tem menos chamados ativos)
4. Tickets similares resolvidos que podem ajudar na solução

Responda SEMPRE em JSON válido com a estrutura:
{
  "prioridade_sugerida": "alta",
  "urgencia_sugerida": "alta",
  "tecnico_sugerido": { "id": "uuid", "nome": "Nome", "motivo": "Justificativa" },
  "tickets_similares": [{ "titulo": "...", "solucao_resumo": "...", "similaridade": 85 }],
  "justificativa": "Explicação das sugestões"
}`
          },
          {
            role: "user",
            content: `Analise este chamado e sugira triagem:

CHAMADO:
Título: ${context.ticket.titulo}
Descrição: ${context.ticket.descricao}
Empresa: ${context.ticket.empresa} (${context.ticket.tipo_contrato})
Ativo: ${context.ticket.ativo || 'Não especificado'}
Canal: ${context.ticket.canal}

HISTÓRICO DE TICKETS SIMILARES:
${JSON.stringify(context.tickets_similares, null, 2)}

TÉCNICOS DISPONÍVEIS:
${JSON.stringify(context.tecnicos, null, 2)}`
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

    // Parse da resposta da IA
    let triageResult;
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        triageResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      triageResult = {
        prioridade_sugerida: 'media',
        urgencia_sugerida: 'media',
        tecnico_sugerido: techniciansWithHistory[0] ? {
          id: techniciansWithHistory[0].id,
          nome: techniciansWithHistory[0].nome,
          motivo: 'Sugestão padrão'
        } : null,
        tickets_similares: [],
        justificativa: 'Análise automática não disponível'
      };
    }

    console.log('[ai-ticket-triage] Triagem concluída para ticket:', ticket_id);

    return new Response(JSON.stringify(triageResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-ticket-triage] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
