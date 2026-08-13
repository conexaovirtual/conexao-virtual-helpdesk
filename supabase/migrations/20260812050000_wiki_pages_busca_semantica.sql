-- Espelho pesquisável das páginas da wiki interna (BookStack).
--
-- Por que espelhar em vez de consultar a API do BookStack na hora: a busca que
-- interessa é semântica (mesmo embedding do knowledge_articles), e a API do
-- BookStack só faz busca textual. Além disso, uma tabela local deixa a Miya e o
-- sugestor de solução consultarem sem depender da wiki estar no ar.

create table if not exists public.wiki_pages (
  id                uuid primary key default gen_random_uuid(),
  bookstack_page_id integer not null unique,
  titulo            text not null,
  livro             text,
  capitulo          text,
  url               text not null,
  conteudo          text not null default '',
  -- Espelha a tag "cliente" da página no BookStack. FALSO por padrão: a wiki é
  -- interna, e a Miya conversa com CLIENTE no WhatsApp — sem esta trava, marcar
  -- uma página como fonte da Miya vazaria documentação interna para fora.
  visivel_cliente   boolean not null default false,
  content_hash      text,
  embedding         vector(1536),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.wiki_pages is
  'Cópia pesquisável das páginas do BookStack (docs.conexaovirtual.cloud). Alimentada pela função bookstack-wiki-sync; não editar à mão.';
comment on column public.wiki_pages.visivel_cliente is
  'True apenas quando a página tem a tag "cliente" no BookStack. Só estas podem ser usadas pela Miya em conversa com cliente.';

create index if not exists wiki_pages_embedding_idx
  on public.wiki_pages using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.wiki_pages enable row level security;

-- Mesmo padrão do knowledge_articles: qualquer usuário autenticado lê; escrita
-- é da função (service role, que ignora RLS).
create policy "Authenticated users can view wiki pages"
  on public.wiki_pages for select
  using (auth.uid() is not null);

create policy "Admins and technicians can manage wiki pages"
  on public.wiki_pages for all
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'tecnico'::user_role));

-- Busca semântica. p_somente_cliente = true restringe às páginas liberadas
-- para cliente (uso da Miya).
create or replace function public.match_wiki_pages(
  query_embedding   vector,
  match_count       integer default 5,
  match_threshold   double precision default 0.2,
  p_somente_cliente boolean default false
)
returns table (
  id uuid, bookstack_page_id integer, titulo text, livro text, capitulo text,
  url text, conteudo text, similarity double precision
)
language sql
stable
as $$
  select wp.id, wp.bookstack_page_id, wp.titulo, wp.livro, wp.capitulo,
         wp.url, wp.conteudo,
         1 - (wp.embedding <=> query_embedding) as similarity
  from public.wiki_pages wp
  where wp.embedding is not null
    and (not p_somente_cliente or wp.visivel_cliente)
    and 1 - (wp.embedding <=> query_embedding) > match_threshold
  order by wp.embedding <=> query_embedding
  limit match_count;
$$;

-- Gravar vetor via RPC, igual ao update_article_embedding (o cliente JS manda
-- o vetor como texto).
create or replace function public.update_wiki_page_embedding(
  p_bookstack_page_id integer,
  p_embedding text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.wiki_pages
  set embedding = p_embedding::vector
  where bookstack_page_id = p_bookstack_page_id;
end;
$$;
