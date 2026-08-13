-- Hash do conteúdo publicado na wiki.
--
-- Por que não dá para usar updated_at: o gatilho update_knowledge_articles_updated_at
-- dispara em QUALQUER update da linha, inclusive quando a própria sincronização
-- grava bookstack_page_id/bookstack_synced_at. Resultado: updated_at fica sempre
-- à frente de bookstack_synced_at e todo artigo parece pendente — o backfill
-- reescrevia as 44 páginas a cada execução e enchia o histórico de revisões da wiki.
--
-- O hash cobre as mesmas colunas que o gatilho de embedding considera conteúdo
-- (titulo, problema, solucao, tags, categoria).

alter table public.knowledge_articles
  add column if not exists bookstack_content_hash text;

comment on column public.knowledge_articles.bookstack_content_hash is
  'SHA-256 do conteúdo publicado na wiki. Igual = página já está em dia, não republicar.';
