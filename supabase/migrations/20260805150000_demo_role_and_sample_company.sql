-- Usuário de demonstração pra José mandar pra um cliente ver o painel
-- funcionando, sem expor dado real de nenhum cliente dele e sem poder
-- alterar/inserir nada (José pediu 05/08/2026).

-- Empresa fictícia + dados de exemplo (nada real).
insert into companies (id, nome_fantasia, razao_social, tipo_contrato, endereco, telefone, email, status)
values (
  '00000000-0000-4000-9000-000000000001',
  'Empresa Demonstração',
  'Empresa Demonstração LTDA (dados fictícios)',
  'contrato_manutencao',
  'Av. Exemplo, 1000 - Centro, Goiânia/GO',
  '(62) 90000-0000',
  'contato@empresademonstracao.exemplo',
  true
);

insert into assets (id, company_id, nome, tipo, estado, fabricante, modelo, tag_patrimonial, local)
values
  ('00000000-0000-4000-9000-000000000011', '00000000-0000-4000-9000-000000000001', 'Notebook Recepção', 'notebook', 'em_uso', 'Dell', 'Latitude 5420', 'DEMO-001', 'Recepção'),
  ('00000000-0000-4000-9000-000000000012', '00000000-0000-4000-9000-000000000001', 'Servidor de Arquivos', 'servidor', 'em_uso', 'HPE', 'ProLiant DL20', 'DEMO-002', 'Sala de TI'),
  ('00000000-0000-4000-9000-000000000013', '00000000-0000-4000-9000-000000000001', 'Impressora Financeiro', 'impressora', 'manutencao', 'HP', 'LaserJet Pro M404', 'DEMO-003', 'Financeiro');

insert into tickets (id, company_id, titulo, descricao, status, canal, prioridade, urgencia, impacto, public_request, solicitante_nome, solicitante_contato, asset_id, created_at)
values
  ('00000000-0000-4000-9000-000000000021', '00000000-0000-4000-9000-000000000001', 'Impressora não puxa papel', 'A impressora do financeiro está puxando duas folhas de uma vez.', 'em_atendimento', 'whatsapp', 'media', 'media', 'baixo', true, 'Ana Exemplo', '5562900000001', '00000000-0000-4000-9000-000000000013', now() - interval '2 days'),
  ('00000000-0000-4000-9000-000000000022', '00000000-0000-4000-9000-000000000001', 'Notebook lento pela manhã', 'Notebook da recepção demora muito pra ligar e abrir os sistemas.', 'resolvido', 'whatsapp', 'baixa', 'baixa', 'baixo', true, 'Ana Exemplo', '5562900000001', '00000000-0000-4000-9000-000000000011', now() - interval '10 days'),
  ('00000000-0000-4000-9000-000000000023', '00000000-0000-4000-9000-000000000001', 'Backup do servidor falhando', 'O backup automático não rodou nas últimas 2 noites.', 'novo', 'web', 'alta', 'alta', 'alto', true, 'Carlos Exemplo', '5562900000002', '00000000-0000-4000-9000-000000000012', now() - interval '3 hours');

insert into service_orders (id, company_id, tecnico_id, ticket_id, asset_id, tipo_servico, prioridade, modalidade, descricao_servicos, data_agendada, hora_agendada, status, observacoes)
values (
  '00000000-0000-4000-9000-000000000031',
  '00000000-0000-4000-9000-000000000001',
  'e336e78e-c11a-48b5-8d69-2bb48cf6bb3b',
  '00000000-0000-4000-9000-000000000021',
  '00000000-0000-4000-9000-000000000013',
  'corretivo', 'media', 'presencial',
  'Visita técnica pra revisar o alimentador de papel da impressora.',
  (now() + interval '2 days'), '10:00', 'agendada',
  'OS de exemplo — dados fictícios, só pra demonstração.'
);

insert into daily_service_records (company_id, asset_id, tecnico_id, data_atendimento, hora_inicio, hora_fim, canal, titulo, descricao, solucao, status)
values (
  '00000000-0000-4000-9000-000000000001',
  '00000000-0000-4000-9000-000000000011',
  'e336e78e-c11a-48b5-8d69-2bb48cf6bb3b',
  (now() - interval '10 days')::date, '09:00', '09:40', 'acesso_remoto',
  'Limpeza de inicialização do notebook',
  'Cliente relatou lentidão ao ligar o notebook pela manhã.',
  'Removidos programas de inicialização desnecessários e feita limpeza de disco. Desempenho normalizado.',
  'concluido'
);

-- Fecha o único caminho de escrita que sobraria pra role 'demo': a policy
-- de INSERT em tickets libera por company_id batendo, sem checar role (é
-- assim de propósito, pro fluxo de autoatendimento do cliente real —
-- 'solicitante'). Exclui explicitamente só a role 'demo' dessa cláusula,
-- sem tocar no comportamento de nenhuma outra role.
drop policy if exists "Users can create tickets" on tickets;
create policy "Users can create tickets" on tickets for insert
  with check (
    is_admin(auth.uid())
    or has_role(auth.uid(), 'tecnico'::user_role)
    or (company_id = get_user_company_id(auth.uid()) and not has_role(auth.uid(), 'demo'::user_role))
  );
