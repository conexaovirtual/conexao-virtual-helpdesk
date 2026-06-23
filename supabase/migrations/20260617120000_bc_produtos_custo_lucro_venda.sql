-- Catálogo de produtos local (cadastro manual, já que o BomControle não expõe produtos via API)
-- Adiciona campos de custo / margem de lucro / preço de venda à tabela bc_produtos.
alter table public.bc_produtos
  add column if not exists preco_custo numeric not null default 0,
  add column if not exists percentual_lucro numeric not null default 0,
  add column if not exists preco_venda numeric not null default 0;

-- Permite escrita pelo app (mesmo padrão de bc_servicos)
drop policy if exists "auth_insert_bc_produtos" on public.bc_produtos;
drop policy if exists "auth_update_bc_produtos" on public.bc_produtos;
drop policy if exists "auth_delete_bc_produtos" on public.bc_produtos;

create policy "auth_insert_bc_produtos" on public.bc_produtos
  for insert to authenticated with check (true);
create policy "auth_update_bc_produtos" on public.bc_produtos
  for update to authenticated using (true) with check (true);
create policy "auth_delete_bc_produtos" on public.bc_produtos
  for delete to authenticated using (true);
