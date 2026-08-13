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
    if (!ticket_id && !daily_record_id) throw new Error('ticket_id or daily_record_id is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let titulo = '';
    let descricao = '';
    let solucao = '';
    let empresaNome = 'N/A';
    let ativoInfo = 'N/A';
    const sourceId = ticket_id || daily_record_id;

    if (daily_record_id) {
      const { data: record, error } = await supabase
        .from('daily_service_records')
        .select(`*, companies(nome_fantasia), assets(tipo, nome, fabricante, modelo)`)
        .eq('id', daily_record_id)
        .single();

      if (error || !record) throw new Error('Atendimento não encontrado');
      if (!record.solucao) throw new Error('Atendimento sem solução documentada');

      titulo = record.titulo;
      descricao = record.descricao;
      solucao = record.solucao;
      empresaNome = record.companies?.nome_fantasia || 'N/A';
      if (record.assets) ativoInfo = `${record.assets.tipo} - ${record.assets.nome}`;
    } else {
      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`*, companies(nome_fantasia), assets(tipo, nome, fabricante, modelo)`)
        .eq('id', ticket_id)
        .single();

      if (error || !ticket) throw new Error('Ticket não encontrado');
      if (!ticket.solucao) throw new Error('Ticket sem solução documentada');

      titulo = ticket.titulo;
      descricao = ticket.descricao;
      solucao = ticket.solucao;
      empresaNome = ticket.companies?.nome_fantasia || 'N/A';
      if (ticket.assets) ativoInfo = `${ticket.assets.tipo} - ${ticket.assets.nome}`;
    }

    // Verificar se já existe artigo publicado OU proposta pendente/aplicada para esta fonte
    // Only check by ticket_id if source is a ticket (daily_record_id is not a valid ticket FK)
    if (ticket_id) {
      const { data: existing } = await supabase
        .from('knowledge_articles')
        .select('id')
        .eq('ticket_id', ticket_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ message: 'Artigo já existe', article_id: existing.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingProposal } = await supabase
        .from('agent_proposals')
        .select('id')
        .eq('tipo_proposta', 'atualizacao_conhecimento')
        .contains('source_refs', { ticket_id })
        .in('status', ['pendente', 'aplicada'])
        .maybeSingle();

      if (existingProposal) {
        return new Response(JSON.stringify({ message: 'Proposta já existe', proposal_id: existingProposal.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Chamar IA para gerar artigo
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
            content: `Você é um redator técnico de TI. Transforme tickets resolvidos em artigos de base de conhecimento.
Responda em JSON válido:
{
  "titulo": "Título claro e pesquisável do artigo",
  "problema": "Descrição objetiva do problema (2-4 frases)",
  "solucao": "Passos detalhados da solução em formato de lista numerada",
  "tags": ["tag1", "tag2", "tag3"],
  "categoria": "categoria do problema"
}
As tags devem ser palavras-chave úteis para busca. A categoria deve ser uma das: Hardware, Software, Rede, Segurança, Impressão, Email, Backup, Acesso, Sistema Operacional, Outros.`
          },
          {
            role: "user",
            content: `Transforme este atendimento resolvido em artigo:
Título: ${titulo}
Descrição: ${descricao}
Solução: ${solucao}
Empresa: ${empresaNome}
Ativo: ${ativoInfo}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    let article;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      article = JSON.parse(jsonMatch![0]);
    } catch {
      article = {
        titulo: titulo,
        problema: descricao.substring(0, 500),
        solucao: solucao,
        tags: [],
        categoria: 'Outros'
      };
    }

    // Não publica mais direto — vira uma proposta pendente de aprovação da
    // diretoria (José). "Aplicar" (na tela de propostas) que de fato insere
    // em knowledge_articles, usando dados_estruturados abaixo.
    const conteudoProposto = `**${article.titulo}**\n\nProblema: ${article.problema}\n\nSolução:\n${article.solucao}\n\nCategoria: ${article.categoria || 'Outros'} | Tags: ${(article.tags || []).join(', ')}`;

    const { data: newProposal, error: insertError } = await supabase
      .from('agent_proposals')
      .insert({
        departamento: 'operacional',
        tipo_proposta: 'atualizacao_conhecimento',
        titulo: `Novo artigo de base de conhecimento: ${article.titulo}`,
        justificativa: `Gerado a partir de ${ticket_id ? 'chamado' : 'atendimento'} resolvido (${empresaNome}${ativoInfo !== 'N/A' ? `, ${ativoInfo}` : ''}).`,
        conteudo_proposto: conteudoProposto,
        dados_estruturados: {
          destino: 'knowledge_articles',
          ticket_id: ticket_id || null,
          titulo: article.titulo,
          problema: article.problema,
          solucao: article.solucao,
          tags: article.tags || [],
          categoria: article.categoria || 'Outros',
        },
        source_refs: { ticket_id: ticket_id || null, daily_record_id: daily_record_id || null },
        created_by_agent: 'ai-knowledge-generator',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('[ai-knowledge-generator] Proposal created:', newProposal.id);

    return new Response(JSON.stringify({ proposal: newProposal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error('[ai-knowledge-generator] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
