-- Paradas avulsas de deslocamento: locais que NÃO são clientes mas geram
-- quilometragem (deixar/buscar equipamento em assistência, comprar peça, etc.).
-- Entram no encadeamento do dia (useDisplacementReport) pela ordem de horário.
create table if not exists public.displacement_stops (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id) on delete cascade,
  data date not null default current_date,
  hora time,
  tipo text not null default 'outro'
    check (tipo in ('deixar_manutencao', 'buscar_manutencao', 'compra_equipamento', 'outro')),
  nome text,                 -- nome do local ("Assistência Sublime", "Kalunga"...)
  endereco text,
  latitude double precision,
  longitude double precision,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_displacement_stops_tec_data
  on public.displacement_stops (tecnico_id, data);

alter table public.displacement_stops enable row level security;

create policy "displacement_stops_select" on public.displacement_stops
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(), 'tecnico'));

create policy "displacement_stops_insert" on public.displacement_stops
  for insert to authenticated
  with check (public.is_admin(auth.uid()) or tecnico_id = auth.uid());

create policy "displacement_stops_update" on public.displacement_stops
  for update to authenticated
  using (public.is_admin(auth.uid()) or tecnico_id = auth.uid())
  with check (public.is_admin(auth.uid()) or tecnico_id = auth.uid());

create policy "displacement_stops_delete" on public.displacement_stops
  for delete to authenticated
  using (public.is_admin(auth.uid()) or tecnico_id = auth.uid());

-- mantém updated_at em dia (mesmo trigger usado nas outras tabelas)
create trigger update_displacement_stops_updated_at
  before update on public.displacement_stops
  for each row execute function public.update_updated_at_column();
