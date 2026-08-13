-- tickets.asset_id nunca teve FK para assets, o que quebra o embed automático do
-- PostgREST (select('*, assets(...)')) usado por ai-knowledge-generator e faz a
-- function falhar com "Ticket não encontrado" para todo ticket_id.

-- Limpa referências órfãs (assets excluídos sem cascade) antes de criar a constraint.
update tickets
set asset_id = null
where asset_id is not null
  and asset_id not in (select id from assets);

alter table tickets
  add constraint tickets_asset_id_fkey
  foreign key (asset_id) references assets(id);
