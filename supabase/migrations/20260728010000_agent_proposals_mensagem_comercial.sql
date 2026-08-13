-- Fase 4 (Departamento Comercial) da "empresa virtual": agent_proposals ganha
-- destinatário estruturado pra suportar propostas de mensagem comercial 1:1
-- (a Miya sugere, José revisa destinatário+texto e aprova manualmente).
alter table agent_proposals
  add column destinatario_phone text,
  add column destinatario_company_id uuid references companies(id);

alter table agent_proposals drop constraint agent_proposals_tipo_proposta_check;
alter table agent_proposals add constraint agent_proposals_tipo_proposta_check
  check (tipo_proposta in ('nova_regra_negocio','atualizacao_conhecimento','excecao_pontual','mensagem_comercial'));
