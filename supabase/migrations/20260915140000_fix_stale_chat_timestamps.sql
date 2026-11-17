-- Recalcula o last_message_at de todas as conversas para garantir ordenação perfeita por mensagens recentes
update public.chats c
set last_message_at = coalesce(
  (
    select max(m.created_at)
    from public.messages m
    where m.chat_id = c.id
  ),
  c.created_at,
  now()
)
where c.last_message_at is null or c.last_message_at < '2020-01-01'::timestamptz;

-- Garante réplica integral para atualizações em tempo real pelo Supabase Realtime
alter table public.chats replica identity full;
alter table public.messages replica identity full;


