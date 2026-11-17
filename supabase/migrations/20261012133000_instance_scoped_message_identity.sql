-- Evolution message IDs are scoped to an instance.  The same WhatsApp
-- message/client ID must never deduplicate a message from another connection
-- in the same workspace.
drop index if exists public.idx_messages_workspace_external;
alter table public.messages
  drop constraint if exists messages_workspace_external_key;

create unique index if not exists idx_messages_workspace_instance_external
  on public.messages (workspace_id, instance_id, external_id)
  where external_id is not null;

drop index if exists public.idx_messages_workspace_client_msg_id;
create unique index if not exists idx_messages_workspace_instance_client_msg_id
  on public.messages (workspace_id, instance_id, client_message_id)
  where client_message_id is not null;

alter table public.outbound_messages
  drop constraint if exists outbound_messages_workspace_client_message_id_key;
create unique index if not exists idx_outbound_workspace_instance_client_message
  on public.outbound_messages (workspace_id, instance_id, client_message_id);

create or replace function public.persist_inbox_message(
  p_workspace_id uuid,
  p_instance_name text,
  p_phone text,
  p_remote_jid text,
  p_identity_kind text,
  p_name text,
  p_profile_pic_url text,
  p_is_group boolean,
  p_sender text,
  p_sender_name text,
  p_sender_phone text,
  p_sender_avatar text,
  p_quoted_message jsonb,
  p_type text,
  p_text text,
  p_media_url text,
  p_media_mimetype text,
  p_media_filename text,
  p_media_duration integer,
  p_external_id text,
  p_client_message_id uuid,
  p_status text,
  p_created_at timestamptz,
  p_increment_unread boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_instance_id uuid;
  v_chat public.chats%rowtype;
  v_message public.messages%rowtype;
  v_inserted boolean := false;
  v_preview text;
begin
  select id into v_instance_id from public.whatsapp_instances
  where workspace_id = p_workspace_id and instance_name = p_instance_name;
  if v_instance_id is null then raise exception 'owned instance not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_instance_name || ':' || p_phone, 0));
  select * into v_chat from public.chats
  where workspace_id = p_workspace_id and instance_name = p_instance_name and phone = p_phone
  for update;

  v_preview := case p_type
    when 'text' then coalesce(p_text, '')
    when 'image' then 'Foto'
    when 'video' then 'Vídeo'
    when 'audio' then 'Áudio'
    when 'document' then 'Documento'
    when 'sticker' then 'Figurinha'
    else 'Mensagem apagada'
  end;

  if v_chat.id is null then
    insert into public.chats(
      workspace_id, instance_id, instance_name, phone, phone_e164,
      remote_jid, identity_kind, name, profile_pic_url, last_message,
      last_message_type, last_message_at, unread, is_group
    ) values (
      p_workspace_id, v_instance_id, p_instance_name, p_phone,
      case when p_identity_kind = 'phone' then p_phone else null end,
      p_remote_jid, p_identity_kind, p_name, p_profile_pic_url, v_preview,
      p_type, p_created_at, case when p_increment_unread then 1 else 0 end,
      p_is_group
    ) returning * into v_chat;
  end if;

  if p_external_id is not null then
    select * into v_message from public.messages
    where workspace_id = p_workspace_id
      and instance_id = v_instance_id
      and external_id = p_external_id;
  elsif p_client_message_id is not null then
    select * into v_message from public.messages
    where workspace_id = p_workspace_id
      and instance_id = v_instance_id
      and client_message_id = p_client_message_id;
  end if;

  if v_message.id is null then
    insert into public.messages(
      workspace_id, instance_id, chat_id, remote_jid, external_id,
      client_message_id, sender, sender_name, sender_phone, sender_avatar,
      quoted_message, type, text, media_url, media_mimetype, media_filename,
      media_duration, status, created_at
    ) values (
      p_workspace_id, v_instance_id, v_chat.id, p_remote_jid, p_external_id,
      p_client_message_id, p_sender, p_sender_name, p_sender_phone,
      p_sender_avatar, p_quoted_message,
      case when p_type = 'deleted' then 'text' else p_type end,
      case when p_type = 'deleted' then 'Mensagem apagada' else p_text end,
      p_media_url, p_media_mimetype, p_media_filename, p_media_duration,
      p_status, p_created_at
    ) returning * into v_message;
    v_inserted := true;

    if v_chat.last_message_at is null or v_chat.last_message_at <= p_created_at then
      update public.chats set
        instance_id = v_instance_id,
        remote_jid = coalesce(p_remote_jid, remote_jid),
        identity_kind = coalesce(p_identity_kind, identity_kind),
        phone_e164 = case when p_identity_kind = 'phone' then p_phone else phone_e164 end,
        name = coalesce(nullif(p_name, ''), name),
        profile_pic_url = coalesce(nullif(p_profile_pic_url, ''), profile_pic_url),
        last_message = v_preview,
        last_message_type = p_type,
        last_message_at = p_created_at,
        unread = unread + case when p_increment_unread then 1 else 0 end,
        is_group = p_is_group
      where id = v_chat.id
      returning * into v_chat;
    end if;
  end if;

  return jsonb_build_object(
    'chat_id', v_chat.id,
    'message', to_jsonb(v_message),
    'inserted', v_inserted,
    'duplicated', not v_inserted
  );
end;
$$;

revoke all on function public.persist_inbox_message(
  uuid, text, text, text, text, text, text, boolean, text, text, text,
  text, jsonb, text, text, text, text, text, integer, text, uuid, text,
  timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.persist_inbox_message(
  uuid, text, text, text, text, text, text, boolean, text, text, text,
  text, jsonb, text, text, text, text, text, integer, text, uuid, text,
  timestamptz, boolean
) to service_role;
