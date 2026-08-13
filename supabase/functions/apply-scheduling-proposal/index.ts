// Aplica uma proposta de agendamento (agent_proposals.tipo_proposta =
// 'agendamento_visita') já aprovada pelo José na tela /agent-proposals: cria
// a OS de verdade (revalidando o slot em tempo real via autoScheduleServiceOrder
// — o horário candidato guardado na proposta pode ter sido ocupado entre a
// sugestão e a aprovação) e avisa o cliente pelo WhatsApp com o horário final.
// Chamada só pelo painel (usuário autenticado), nunca pela Miya.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWabaText } from "../_shared/waba-provider.ts";
import { autoScheduleServiceOrder } from "../_shared/service-order-scheduler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { proposal_id } = await req.json();
    if (!proposal_id) {
      return new Response(JSON.stringify({ success: false, error: "proposal_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: proposal, error: fetchErr } = await supabase
      .from("agent_proposals")
      .select("*")
      .eq("id", proposal_id)
      .maybeSingle();

    if (fetchErr || !proposal) {
      return new Response(JSON.stringify({ success: false, error: "Proposta não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (proposal.tipo_proposta !== "agendamento_visita") {
      return new Response(JSON.stringify({ success: false, error: "Proposta não é do tipo agendamento_visita" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (proposal.status !== "aprovada") {
      return new Response(JSON.stringify({ success: false, error: "Proposta precisa estar aprovada antes de aplicar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!proposal.destinatario_company_id) {
      return new Response(JSON.stringify({ success: false, error: "Proposta sem empresa vinculada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dados = proposal.dados_estruturados || {};
    const tecnicoPreescolhido = dados.tecnico_id
      ? { id: dados.tecnico_id, nome: dados.tecnico_nome || "Técnico" }
      : undefined;

    const schedResult = await autoScheduleServiceOrder(supabase, {
      company_id: proposal.destinatario_company_id,
      ticket_id: dados.ticket_id || null,
      titulo: proposal.titulo,
      descricao: proposal.conteudo_proposto,
      tipo_servico: dados.tipo_servico,
      urgencia: dados.urgencia,
      data_desejada: dados.data_desejada,
      tecnico_preescolhido: tecnicoPreescolhido,
    });

    if (!schedResult.success) {
      return new Response(JSON.stringify({ success: false, error: schedResult.error || "Falha ao agendar" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("agent_proposals")
      .update({ status: "aplicada", applied_at: new Date().toISOString() })
      .eq("id", proposal.id);

    // Avisa o cliente com o horário FINAL (pode ter mudado levemente do
    // candidato original, se o slot foi ocupado entre a sugestão e a
    // aprovação — smart-scheduler já resolveu isso escolhendo o próximo
    // disponível pro mesmo técnico).
    if (proposal.destinatario_phone) {
      const clienteMsg = `✅ Sua visita técnica está confirmada!\n\n` +
        `🗓️ ${schedResult.data_agendada} às ${schedResult.hora_inicio}\n` +
        `🛠️ ${schedResult.modalidade === "remoto" ? "Atendimento remoto" : "Atendimento presencial"}\n\n` +
        `Qualquer dúvida, é só chamar por aqui!`;
      try {
        await sendWabaText(proposal.destinatario_phone, clienteMsg, { openTicket: false });
      } catch (notifyErr) {
        console.error("Failed to notify client about confirmed schedule:", notifyErr);
      }
    }

    return new Response(JSON.stringify({ success: true, ...schedResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("apply-scheduling-proposal error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
