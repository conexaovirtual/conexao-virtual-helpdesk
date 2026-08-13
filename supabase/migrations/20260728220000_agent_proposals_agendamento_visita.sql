-- Aprovação obrigatória antes de qualquer OS virar real (José pediu
-- 28/07/2026, depois de um caso real de agendamento em empresa ambígua).
-- agent_proposals ganha o tipo 'agendamento_visita' — reaproveita as
-- colunas destinatario_phone/destinatario_company_id já criadas na Fase 4
-- e dados_estruturados (jsonb) guarda o horário candidato e o técnico
-- sugerido pelo previewSchedule.
alter table agent_proposals drop constraint agent_proposals_tipo_proposta_check;
alter table agent_proposals add constraint agent_proposals_tipo_proposta_check
  check (tipo_proposta in ('nova_regra_negocio','atualizacao_conhecimento','excecao_pontual','mensagem_comercial','agendamento_visita'));
