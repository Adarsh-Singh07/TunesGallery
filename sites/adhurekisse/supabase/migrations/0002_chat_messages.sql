-- ═══════════════════════════════════════════════════════════════════════════
-- 0002 — global chat messages (ChatPanel live chat)
-- The original adhurekisse Supabase project had this table; recreate it here
-- so the chat works against this project too. Authenticated-only by RLS.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  sender     text not null default 'anon',
  text       text not null check (char_length(text) <= 500),
  created_at timestamptz not null default now()
);
create index messages_created_idx on public.messages (created_at desc);

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated using (true);
create policy messages_insert on public.messages
  for insert to authenticated with check (char_length(text) <= 500);

grant select, insert on public.messages to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;

alter publication supabase_realtime add table public.messages;
