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
    const { ticket_id, daily_record_id } = await req.json();
    
    if (!ticket_id && !daily_record_id) {
      throw new Error('ticket_id or daily_record_id is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let titulo = '';
    let descricao = '';
    let empresaNome = 'N/A';
    let ativoInfo = 'Não especificado';
    let comments = '';
    let companyId = '';
    let assetId: string | null = null;

    if (daily_record_id) {
      // Buscar dados do atendimento diário
      const { data: record, error: recordError } = await supabase
        .from('daily_service_records')
        .select(`
          *,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo, sistema_operacional)
        `)
        .eq('id', daily_record_id)
        .single();

      if (recordError || !record) throw new Error('Atendimento não encontrado');

      titulo = record.titulo;
      descricao = record.descricao;
      empresaNome = record.companies?.nome_fantasia || 'N/A';
      companyId = record.company_id;
      assetId = record.asset_id;
      if (record.assets) {
        ativoInfo = `${record.assets.tipo} - ${record.assets.nome} (${record.assets.fabricante || ''} ${record.assets.modelo || ''}) - SO: ${record.assets.sistema_operacional || 'N/A'}`;
      }
      comments = record.observacoes || '';
    } else {
      // Buscar dados do ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          companies(nome_fantasia),
          assets(tipo, nome, fabricante, modelo, sistema_operacional),
          ticket_comments(comentario, created_at, is_internal)
        `)
        .eq('id', ticket_id)
        .single();

      if (ticketError || !ticket) throw new Error('Ticket não encontrado');

      titulo = ticket.titulo;
      descricao = ticket.descricao;
      empresaNome = ticket.companies?.nome_fantasia || 'N/A';
      companyId = ticket.company_id;
      assetId = ticket.asset_id;
      if (ticket.assets) {
        ativoInfo = `${ticket.assets.tipo} - ${ticket.assets.nome} (${ticket.assets.fabricante || ''} ${ticket.assets.modelo || ''}) - SO: ${ticket.assets.sistema_operacional || 'N/A'}`;
      }
      comments = (ticket.ticket_comments || [])
        .filter((c: any) => c.is_internal)
        .map((c: any) => c.comentario)
        .join('\n');
    }

    // Buscar tickets similares resolvidos
    let similarQuery = supabase
      .from('tickets')
      .select('titulo, descricao, solucao')
      .in('status', ['resolvido', 'fechado'])
      .not('solucao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(15);

    if (ticket_id) similarQuery = similarQuery.neq('id', ticket_id);

    if (assetId) {
      similarQuery = similarQuery.eq('asset_id', assetId);
    } else {
      similarQuery = similarQuery.eq('company_id', companyId);
    }

    const { data: similarTickets } = await similarQuery;

    let fallbackTickets: any[] = [];
    if ((!similarTickets || similarTickets.length < 3) && assetId) {
      const { data: companyTickets } = await supabase
        .from('tickets')
        .select('titulo, descricao, solucao')
        .eq('company_id', companyId)
        .in('status', ['resolvido', 'fechado'])
        .not('solucao', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
      fallbackTickets = companyTickets || [];
    }

    // Also search daily_service_records for similar solutions
    const { data: similarRecords } = await supabase
      .from('daily_service_records')
      .select('titulo, descricao, solucao')
      .eq('company_id', companyId)
      .eq('status', 'concluido')
      .not('solucao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const allSimilar = [
      ...(similarTickets || []),
      ...fallbackTickets,
      ...(similarRecords || []),
    ].slice(0, 20);

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
            content: `Você é um técnico de TI experiente. Com base na descrição do atendimento, observações e histórico de soluções anteriores, sugira uma solução detalhada e profissional.

A solução deve:
- Ser objetiva e técnica
- Descrever os passos realizados
- Incluir verificações feitas
- Mencionar se houve troca de peças ou configuração
- Ter entre 50 e 200 palavras
- Ser escrita em português brasileiro

Responda APENAS com o texto da solução, sem formatação JSON, sem títulos, sem markdown.`
          },
          {
            role: "user",
            content: `ATENDIMENTO:
Título: ${titulo}
Descrição: ${descricao}
Empresa: ${empresaNome}
Ativo: ${ativoInfo}

OBSERVAÇÕES/COMENTÁRIOS:
${comments || 'Nenhuma observação'}

SOLUÇÕES DE ATENDIMENTOS SIMILARES ANTERIORES:
${allSimilar.map((t: any, i: number) => `${i + 1}. Problema: ${t.titulo}\n   Solução: ${t.solucao}`).join('\n\n') || 'Nenhum histórico encontrado'}`
          }
        ],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const suggestion = aiData.choices?.[0]?.message?.content?.trim();

    console.log('[ai-solution-suggester] Sugestão gerada para:', ticket_id || daily_record_id);

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-solution-suggester] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
