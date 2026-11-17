-- Limpeza de conversas e mensagens fantasmas no Supabase
-- 1. Remove mensagens órfãs
delete from public.messages
where chat_id not in (select id from public.chats);

-- 2. Remove conversas fantasmas (sem mensagens e com placeholder "Grupo sincronizado" ou vazias)
delete from public.chats
where id not in (select distinct chat_id from public.messages)
  and (
    last_message is null 
    or last_message = '' 
    or last_message = 'Grupo sincronizado'
    or last_message = 'Conversa iniciada'
  );

-- 3. Remove conversas com telefones inválidos (que não são grupos)
delete from public.chats
where (is_group is null or is_group = false)
  and (
    length(regexp_replace(phone, '\D', '', 'g')) < 7
    or phone like '%@%'
    or phone like '%status%'
    or phone like '%broadcast%'
    or phone like '%lid%'
  );

-- 4. Remove conversas associadas a instâncias desconectadas ou inexistentes
delete from public.chats
where instance_name not in (
  select instance_name from public.whatsapp_instances where status = 'open'
);

-- 5. Função utilitária para manter o banco limpo
create or replace function public.purge_phantom_chats()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  -- Deleta mensagens órfãs
  delete from public.messages where chat_id not in (select id from public.chats);

  -- Deleta chats sem nenhuma mensagem
  with deleted as (
    delete from public.chats
    where id not in (select distinct chat_id from public.messages)
      and (
        last_message is null 
        or last_message = '' 
        or last_message = 'Grupo sincronizado'
      )
    returning id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;
