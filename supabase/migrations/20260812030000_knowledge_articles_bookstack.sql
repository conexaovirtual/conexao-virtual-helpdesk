-- Liga cada artigo da base de conhecimento à página correspondente no BookStack
-- (wiki interna em docs.conexaovirtual.cloud).
--
-- Guardar o id da página é o que permite ATUALIZAR a página existente em vez de
-- criar uma duplicada toda vez que o artigo for republicado.

alter table public.knowledge_articles
  add column if not exists bookstack_page_id integer,
  add column if not exists bookstack_synced_at timestamptz;

comment on column public.knowledge_articles.bookstack_page_id is
  'Id da página no BookStack. Nulo = artigo ainda não publicado na wiki.';
comment on column public.knowledge_articles.bookstack_synced_at is
  'Quando o artigo foi publicado/atualizado na wiki pela última vez.';

-- Busca dos pendentes de publicação (a função bookstack-sync varre por isto).
create index if not exists knowledge_articles_bookstack_pendentes_idx
  on public.knowledge_articles (updated_at)
  where bookstack_page_id is null;
