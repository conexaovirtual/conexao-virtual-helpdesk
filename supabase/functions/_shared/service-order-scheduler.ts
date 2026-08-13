// =====================================================================
// Agendamento automático de OS via WhatsApp — usado por create_ticket e
// create_schedule (waba-ai-agent). Antes essa lógica estava DUPLICADA nos
// dois handlers, cada um com sua própria constante de técnico fixo
// (sempre o José) e seu próprio cálculo manual de numero_os. Consolidado
// aqui na Fase 1 do plano de departamentos (José pediu 22/07/2026, ao
// contratar um segundo técnico).
// =====================================================================

const JOSE_TECNICO_ID = "e336e78e-c11a-48b5-8d69-2bb48cf6bb3b";

export interface TechnicianPick {
  id: string;
  nome: string;
}

// Escolhe o técnico com menos OS ativas no momento. Deliberadamente NÃO
// chama o modelo de IA de novo (ao contrário do padrão usado em
// ai-ticket-triage) — isto acontece no meio de uma conversa de WhatsApp já
// em andamento, e uma segunda chamada à OpenAI só pra decidir entre 2
// técnicos por carga de trabalho adiciona latência/custo/risco de parsing
// sem nenhum ganho: é aritmética, não julgamento.
export async function pickTechnician(supabase: any): Promise<TechnicianPick> {
  try {
    // Só role 'tecnico' — mesmo critério da tela /technicians (Technicians.tsx).
    // NÃO inclui 'admin_provedor': hoje o José tem 2 perfis com o mesmo
    // telefone (um "administrador" e um "Jose Pereira (Técnico)”), e incluir
    // admin_provedor no pool faz o agendamento oscilar entre os dois perfis
    // por carga — a OS pode cair no perfil errado e sumir do "Meu Dia" dele.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "tecnico");

    const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
    if (ids.length === 0) {
      return { id: JOSE_TECNICO_ID, nome: "José Pereira" };
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome")
      .in("id", ids);

    if (!profiles || profiles.length === 0) {
      return { id: JOSE_TECNICO_ID, nome: "José Pereira" };
    }

    // Uma única query pra carga de todos os candidatos, em vez de 1 query
    // por técnico (padrão usado em ai-ticket-triage) — evita N+1.
    const { data: activeOS } = await supabase
      .from("service_orders")
      .select("tecnico_id")
      .in("tecnico_id", ids)
      .in("status", ["agendada", "confirmada", "em_execucao"]);

    const cargaPorTecnico = new Map<string, number>();
    for (const p of profiles) cargaPorTecnico.set(p.id, 0);
    for (const os of activeOS || []) {
      cargaPorTecnico.set(os.tecnico_id, (cargaPorTecnico.get(os.tecnico_id) || 0) + 1);
    }

    let escolhido = profiles[0];
    let menorCarga = cargaPorTecnico.get(profiles[0].id) ?? 0;
    for (const p of profiles) {
      const carga = cargaPorTecnico.get(p.id) ?? 0;
      if (carga < menorCarga) {
        menorCarga = carga;
        escolhido = p;
      }
    }
    return { id: escolhido.id, nome: escolhido.nome };
  } catch (err) {
    console.error("pickTechnician error (fallback pro José):", err);
    return { id: JOSE_TECNICO_ID, nome: "José Pereira" };
  }
}

export interface AutoScheduleInput {
  company_id: string;
  ticket_id?: string | null;
  asset_id?: string | null;
  titulo: string;
  descricao: string;
  tipo_servico?: string;
  urgencia?: string;
  data_desejada?: string;
  // Se o chamador já escolheu um técnico (ex.: pra manter o mesmo técnico
  // do ticket recém-criado), passa aqui — evita escolher 2 técnicos
  // diferentes pro mesmo atendimento numa mesma execução.
  tecnico_preescolhido?: TechnicianPick;
}

export interface AutoScheduleResult {
  success: boolean;
  error?: string;
  os_id?: string;
  numero_os?: number;
  modalidade?: string;
  data_agendada?: string;
  hora_inicio?: string;
  hora_fim?: string;
  tecnico_id?: string;
  tecnico_nome?: string;
}

export interface SchedulePreview {
  success: boolean;
  error?: string;
  tecnico?: TechnicianPick;
  modalidade?: string;
  data?: string;
  hora_inicio?: string;
  hora_fim?: string;
}

// Consulta o smart-scheduler e devolve um slot candidato — SEM criar nada no
// banco. Usado tanto por autoScheduleServiceOrder (que insere em seguida)
// quanto pelo fluxo de aprovação obrigatória (José pediu 28/07/2026, depois
// de um caso real de agendamento em empresa ambígua): a Miya agora só pode
// PROPOR um horário candidato pro cliente ver; a OS de verdade só nasce
// quando o José aprova, e nesse momento o slot é revalidado do zero (pode já
// ter sido ocupado entre a proposta e a aprovação).
export async function previewSchedule(
  supabase: any,
  input: AutoScheduleInput
): Promise<SchedulePreview> {
  try {
    const tecnico = input.tecnico_preescolhido || (await pickTechnician(supabase));

    // SEMPRE passa tecnico_id — sem isso, com 2+ técnicos, o smart-scheduler
    // mede ocupação GLOBAL somada de todos e corta a capacidade real pela
    // metade (um técnico livre pode aparecer como "sem horário" por causa
    // do outro estar ocupado no mesmo slot).
    const schedulerResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/smart-scheduler`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          tecnico_id: tecnico.id,
          description: `${input.titulo} ${input.descricao}`,
          prioridade: input.urgencia === "alta" ? "alta" : "media",
          data_desejada: input.data_desejada,
        }),
      }
    );

    if (!schedulerResponse.ok) {
      return { success: false, error: "Smart Scheduler indisponível" };
    }

    const slot = await schedulerResponse.json();
    if (!slot.success) {
      return { success: false, error: slot.error || "Nenhum horário disponível" };
    }

    return {
      success: true,
      tecnico,
      modalidade: slot.modalidade,
      data: slot.data,
      hora_inicio: slot.hora_inicio,
      hora_fim: slot.hora_fim,
    };
  } catch (err: any) {
    console.error("previewSchedule error:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function autoScheduleServiceOrder(
  supabase: any,
  input: AutoScheduleInput
): Promise<AutoScheduleResult> {
  try {
    const preview = await previewSchedule(supabase, input);
    if (!preview.success || !preview.tecnico) {
      return { success: false, error: preview.error };
    }
    const tecnico = preview.tecnico;
    const slot = { modalidade: preview.modalidade!, data: preview.data!, hora_inicio: preview.hora_inicio!, hora_fim: preview.hora_fim! };

    const { data: company } = await supabase
      .from("companies")
      .select("endereco, telefone")
      .eq("id", input.company_id)
      .maybeSingle();

    // numero_os NUNCA é passado no insert — a coluna tem um trigger
    // (set_service_order_numero, já existente e testado) que gera o
    // número via sequence de forma atômica quando vem NULL. O código
    // antigo calculava manualmente (select max+1) e ignorava esse
    // trigger, reintroduzindo exatamente a corrida que ele existe pra
    // evitar.
    const { data: os, error: osErr } = await supabase
      .from("service_orders")
      .insert({
        company_id: input.company_id,
        ticket_id: input.ticket_id || null,
        asset_id: input.asset_id || null,
        tecnico_id: tecnico.id,
        tipo_servico: input.tipo_servico || (slot.modalidade === "remoto" ? "remoto" : "corretivo"),
        prioridade: input.urgencia === "alta" ? "alta" : "media",
        modalidade: slot.modalidade,
        descricao_servicos: `${input.titulo}\n\n${input.descricao}`,
        data_agendada: `${slot.data}T${slot.hora_inicio}:00`,
        hora_agendada: slot.hora_inicio,
        status: "agendada",
        endereco_atendimento: slot.modalidade === "presencial" ? (company?.endereco || null) : null,
        telefone_contato: company?.telefone || null,
        observacoes: `OS criada automaticamente via WhatsApp.\nModalidade: ${slot.modalidade}`,
      })
      .select("id, numero_os")
      .single();

    if (osErr || !os) {
      return { success: false, error: osErr?.message || "Falha ao criar OS" };
    }

    return {
      success: true,
      os_id: os.id,
      numero_os: os.numero_os,
      modalidade: slot.modalidade,
      data_agendada: slot.data,
      hora_inicio: slot.hora_inicio,
      hora_fim: slot.hora_fim,
      tecnico_id: tecnico.id,
      tecnico_nome: tecnico.nome,
    };
  } catch (err: any) {
    console.error("autoScheduleServiceOrder error:", err);
    return { success: false, error: err.message || String(err) };
  }
}
