-- Local de partida/retorno (casa) por técnico, para o cálculo de deslocamento
alter table public.technician_vehicles
  add column if not exists base_latitude numeric,
  add column if not exists base_longitude numeric,
  add column if not exists base_endereco text;
