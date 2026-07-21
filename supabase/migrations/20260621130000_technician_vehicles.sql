-- Configuração de veículo/combustível por técnico (cálculo de custo de deslocamento)
create table if not exists public.technician_vehicles (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  veiculo text,
  consumo_km_litro numeric not null default 10 check (consumo_km_litro > 0),
  preco_litro numeric not null default 6.00 check (preco_litro >= 0),
  velocidade_media_kmh numeric not null default 30 check (velocidade_media_kmh > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tecnico_id)
);

alter table public.technician_vehicles enable row level security;

create policy "tech_vehicles_select" on public.technician_vehicles
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'tecnico'));

create policy "tech_vehicles_insert" on public.technician_vehicles
  for insert to authenticated
  with check (public.is_admin(auth.uid()) or tecnico_id = auth.uid());

create policy "tech_vehicles_update" on public.technician_vehicles
  for update to authenticated
  using (public.is_admin(auth.uid()) or tecnico_id = auth.uid())
  with check (public.is_admin(auth.uid()) or tecnico_id = auth.uid());

create policy "tech_vehicles_delete" on public.technician_vehicles
  for delete to authenticated
  using (public.is_admin(auth.uid()));
