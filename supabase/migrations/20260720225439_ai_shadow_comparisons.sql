-- Teste em modo sombra: resposta da Claude para a mesma mensagem/contexto que
-- a Miya (OpenAI) já respondeu de verdade. Nunca enviado ao cliente, só para
-- comparação (José pediu 20/07/2026).
create table if not exists ai_shadow_comparisons (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references waba_conversations(id) on delete cascade,
  source_message_id uuid references waba_messages(id) on delete set null,
  customer_message text,
  claude_reply text,
  claude_tool_calls jsonb,
  claude_model text,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_shadow_comparisons_conversation on ai_shadow_comparisons(conversation_id);
create index if not exists idx_ai_shadow_comparisons_created_at on ai_shadow_comparisons(created_at desc);

alter table ai_shadow_comparisons enable row level security;

create policy "authenticated read shadow comparisons"
  on ai_shadow_comparisons for select
  to authenticated
  using (true);
