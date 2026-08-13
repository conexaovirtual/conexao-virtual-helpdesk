-- Onboarding do Mike (técnico de campo novo, role 'tecnico') expôs que a
-- role 'tecnico' tinha acesso amplo demais (empresas de todo mundo,
-- editáveis; chamados/OS/atendimentos de todos os técnicos; contratos de
-- todos os clientes) e que várias tabelas centrais tinham uma policy
-- "authenticated_all_*" (using(true)/with_check(true)) que liberava acesso
-- TOTAL pra QUALQUER usuário autenticado, independente da role — as
-- policies mais específicas (tecnico_id=auth.uid() etc.) nunca chegavam a
-- restringir nada porque o Postgres combina policies permissivas com OR.
-- José pediu (05/08/2026) fechar as duas coisas juntas.

-- ============================================================
-- PARTE A — fecha as policies "libera geral pra qualquer autenticado"
-- ============================================================

drop policy if exists "authenticated_all_companies" on companies;
drop policy if exists "authenticated_all_tickets" on tickets;
drop policy if exists "authenticated_all_service_orders" on service_orders;
drop policy if exists "authenticated_all_daily_service_records" on daily_service_records;
drop policy if exists "authenticated_all_assets" on assets;
drop policy if exists "authenticated_all_profiles" on profiles;

-- orcamentos/orcamento_itens/bc_produtos/bc_servicos não tinham nenhuma
-- policy própria pra admin/tecnico (só a blanket) — substitui por uma
-- explícita equivalente, preservando exatamente o que admin/tecnico já
-- podiam fazer.
drop policy if exists "authenticated users can manage orcamentos" on orcamentos;
create policy "admin_tecnico_manage_orcamentos" on orcamentos for all
  using (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role));

drop policy if exists "authenticated users can manage orcamento_itens" on orcamento_itens;
create policy "admin_tecnico_manage_orcamento_itens" on orcamento_itens for all
  using (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role));

drop policy if exists "auth_read_bc_produtos" on bc_produtos;
drop policy if exists "auth_insert_bc_produtos" on bc_produtos;
drop policy if exists "auth_update_bc_produtos" on bc_produtos;
drop policy if exists "auth_delete_bc_produtos" on bc_produtos;
create policy "admin_tecnico_manage_bc_produtos" on bc_produtos for all
  using (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role));

drop policy if exists "auth_read_bc_servicos" on bc_servicos;
drop policy if exists "auth_insert_bc_servicos" on bc_servicos;
drop policy if exists "auth_update_bc_servicos" on bc_servicos;
drop policy if exists "auth_delete_bc_servicos" on bc_servicos;
create policy "admin_tecnico_manage_bc_servicos" on bc_servicos for all
  using (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(),'tecnico'::user_role));

-- csat_responses: só é escrito pela function csat-send (service_role,
-- ignora RLS) e lido no painel de Satisfação (admin) — nenhuma role de
-- cliente/técnico precisa disso.
drop policy if exists "auth manage csat" on csat_responses;
create policy "admin_select_csat" on csat_responses for select
  using (is_admin(auth.uid()));

-- ============================================================
-- PARTE B — aperta a role tecnico nas tabelas centrais
-- ============================================================

-- companies: tecnico mantém SELECT (precisa do endereço/contato pra
-- atender), mas perde INSERT/UPDATE — só admin cadastra/edita empresa.
drop policy if exists "Admins and technicians can insert companies" on companies;
create policy "Admins can insert companies" on companies for insert
  with check (is_admin(auth.uid()));

drop policy if exists "Admins and technicians can update companies" on companies;
create policy "Admins can update companies" on companies for update
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- tickets: tecnico só vê/atualiza os chamados atribuídos a ele.
drop policy if exists "Users can view tickets from their company" on tickets;
create policy "Users can view tickets from their company" on tickets for select
  using (
    company_id = get_user_company_id(auth.uid())
    or is_admin(auth.uid())
    or (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid())
  );

drop policy if exists "Authorized users can update tickets" on tickets;
create policy "Authorized users can update tickets" on tickets for update
  using (
    is_admin(auth.uid())
    or has_role(auth.uid(),'gestor_cliente'::user_role)
    or (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid())
  );

-- service_orders: tecnico só vê/atualiza as OS dele; só cria em nome dele
-- (ou sem técnico ainda atribuído).
drop policy if exists "Users can view service orders from their company" on service_orders;
create policy "Users can view service orders from their company" on service_orders for select
  using (
    company_id in (select profiles.company_id from profiles where profiles.id = auth.uid())
    or is_admin(auth.uid())
    or (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid())
  );

drop policy if exists "Authorized users can update service orders" on service_orders;
create policy "Authorized users can update service orders" on service_orders for update
  using (
    is_admin(auth.uid())
    or has_role(auth.uid(),'gestor_cliente'::user_role)
    or (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid())
  );

drop policy if exists "Authorized users can create service orders" on service_orders;
create policy "Authorized users can create service orders" on service_orders for insert
  with check (
    is_admin(auth.uid())
    or has_role(auth.uid(),'gestor_cliente'::user_role)
    or (has_role(auth.uid(),'tecnico'::user_role) and (tecnico_id = auth.uid() or tecnico_id is null))
  );

-- daily_service_records: tecnico só vê/cria os atendimentos dele
-- (UPDATE "Technicians can update their own records" já era tecnico_id=
-- auth.uid() — não mexe).
drop policy if exists "Technicians can view all daily records" on daily_service_records;
create policy "Technicians can view their own daily records" on daily_service_records for select
  using (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid());

drop policy if exists "Technicians can create daily records" on daily_service_records;
create policy "Technicians can create their own daily records" on daily_service_records for insert
  with check (
    is_admin(auth.uid())
    or (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid())
  );

-- ============================================================
-- PARTE C — contratos, financeiro, deslocamento
-- ============================================================

-- contracts: tecnico deixa de ver contrato de todo mundo (info financeira).
drop policy if exists "Technicians can view contracts" on contracts;

-- contract_hour_entries: mantém INSERT (precisa pra finalizar OS de
-- contrato, ServiceOrderExecutionDialog.tsx), mas SELECT vira só o que
-- ele mesmo lançou.
drop policy if exists "Technicians can view and insert contract hours" on contract_hour_entries;
create policy "Technicians can view their own contract hours" on contract_hour_entries for select
  using (has_role(auth.uid(),'tecnico'::user_role) and tecnico_id = auth.uid());

-- cost_centers: tecnico não vê centro de custo (já não aparece no menu;
-- agora a RLS também bate).
drop policy if exists "Technicians can view cost centers" on cost_centers;

-- displacement_stops / technician_vehicles: SELECT passa a ser só o
-- próprio (insert/update/delete já eram escopados a tecnico_id=auth.uid()).
drop policy if exists "displacement_stops_select" on displacement_stops;
create policy "displacement_stops_select" on displacement_stops for select
  using (is_admin(auth.uid()) or tecnico_id = auth.uid());

drop policy if exists "tech_vehicles_select" on technician_vehicles;
create policy "tech_vehicles_select" on technician_vehicles for select
  using (is_admin(auth.uid()) or tecnico_id = auth.uid());
