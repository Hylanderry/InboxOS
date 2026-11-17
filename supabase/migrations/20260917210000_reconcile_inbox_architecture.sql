-- Additive reconciliation for the durable inbox architecture.
-- This migration deliberately preserves all existing chats and messages.

alter table public.chats
  add column if not exists instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  add column if not exists remote_jid text,
  add column if not exists phone_e164 text,
  add column if not exists identity_kind text;

alter table public.whatsapp_contacts
  add column if not exists instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  add column if not exists identity_kind text;

alter table public.whatsapp_presence
  add column if not exists instance_id uuid references public.whatsapp_instances(id) on delete cascade;

alter table public.messages
  add column if not exists instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  add column if not exists remote_jid text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists read_local_at timestamptz,
  add column if not exists read_receipt_sent_at timestamptz,
  add column if not exists read_receipt_error text;

update public.chats c
set instance_id = i.id
from public.whatsapp_instances i
where c.instance_id is null
  and i.workspace_id = c.workspace_id
  and i.instance_name = c.instance_name;

update public.chats
set identity_kind = case when is_group then 'group' when phone ~ '^[0-9]{8,14}$' then 'phone' else 'lid' end,
    phone_e164 = case when not is_group and phone ~ '^[0-9]{8,14}$' then phone else null end,
    remote_jid = case
      when is_group then regexp_replace(phone, '\\D', '', 'g') || '@g.us'
      when phone ~ '^[0-9]{8,14}$' then phone || '@s.whatsapp.net'
      else regexp_replace(phone, '\\D', '', 'g') || '@lid'
    end
where remote_jid is null or identity_kind is null;

update public.whatsapp_contacts c
set instance_id = i.id,
    identity_kind = case
      when c.remote_jid like '%@g.us' then 'group'
      when c.remote_jid like '%@lid' then 'lid'
      when c.remote_jid like '%@broadcast' then 'broadcast'
      else 'phone'
    end
from public.whatsapp_instances i
where i.workspace_id = c.workspace_id
  and i.instance_name = c.instance_name
  and (c.instance_id is null or c.identity_kind is null);

update public.whatsapp_presence p
set instance_id = i.id
from public.whatsapp_instances i
where p.instance_id is null
  and i.workspace_id = p.workspace_id
  and i.instance_name = p.instance_name;

update public.messages m
set instance_id = c.instance_id,
    remote_jid = c.remote_jid
from public.chats c
where m.chat_id = c.id
  and (m.instance_id is null or m.remote_jid is null);

alter table public.chats drop constraint if exists chats_identity_kind_check;
alter table public.chats add constraint chats_identity_kind_check
  check (identity_kind is null or identity_kind in ('phone','lid','group','broadcast'));
alter table public.whatsapp_contacts drop constraint if exists whatsapp_contacts_identity_kind_check;
alter table public.whatsapp_contacts add constraint whatsapp_contacts_identity_kind_check
  check (identity_kind is null or identity_kind in ('phone','lid','group','broadcast'));

create unique index if not exists chats_workspace_instance_remote_jid_uidx
  on public.chats(workspace_id, instance_id, remote_jid)
  where instance_id is not null and remote_jid is not null;
create index if not exists chats_workspace_last_message_id_idx
  on public.chats(workspace_id, last_message_at desc, id desc);
create unique index if not exists messages_workspace_client_message_uidx
  on public.messages(workspace_id, client_message_id)
  where client_message_id is not null;
create index if not exists messages_chat_created_id_idx
  on public.messages(chat_id, created_at desc, id desc);

create table if not exists public.contact_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete cascade,
  alias_jid text not null,
  canonical_jid text not null,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, instance_id, alias_jid)
);

create table if not exists public.group_participants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  participant_jid text not null,
  phone_e164 text,
  display_name text,
  profile_pic_url text,
  role text not null default 'member' check (role in ('member','admin','superadmin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chat_id, participant_jid)
);

create table if not exists public.evolution_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  instance_name text not null,
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','dead_letter')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processing_at timestamptz,
  processed_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  request_id text,
  unique(workspace_id, event_key)
);
create index if not exists evolution_events_status_retry_idx
  on public.evolution_events(status, next_attempt_at, received_at);

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  client_message_id uuid not null,
  remote_jid text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','accepted','confirmed','unknown','failed')),
  external_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  confirmed_at timestamptz,
  unique(workspace_id, client_message_id)
);
create index if not exists outbound_messages_status_idx
  on public.outbound_messages(workspace_id, status, updated_at);

create table if not exists public.inbox_events (
  sequence bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type text not null,
  entity_id uuid,
  chat_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inbox_events_workspace_sequence_idx
  on public.inbox_events(workspace_id, sequence);

alter table public.contact_identity_aliases enable row level security;
alter table public.group_participants enable row level security;
alter table public.evolution_events enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.inbox_events enable row level security;
revoke all on public.contact_identity_aliases, public.group_participants, public.evolution_events, public.outbound_messages, public.inbox_events from anon, authenticated;
grant all on public.contact_identity_aliases, public.group_participants, public.evolution_events, public.outbound_messages, public.inbox_events to service_role;
grant usage, select on sequence public.inbox_events_sequence_seq to service_role;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_messages_updated_at on public.messages;
create trigger touch_messages_updated_at before update on public.messages
for each row execute function public.touch_updated_at();
drop trigger if exists touch_aliases_updated_at on public.contact_identity_aliases;
create trigger touch_aliases_updated_at before update on public.contact_identity_aliases
for each row execute function public.touch_updated_at();
drop trigger if exists touch_group_participants_updated_at on public.group_participants;
create trigger touch_group_participants_updated_at before update on public.group_participants
for each row execute function public.touch_updated_at();
drop trigger if exists touch_outbound_messages_updated_at on public.outbound_messages;
create trigger touch_outbound_messages_updated_at before update on public.outbound_messages
for each row execute function public.touch_updated_at();

create or replace function public.emit_inbox_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  ws uuid;
  entity uuid;
  related_chat uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  ws := (row_data->>'workspace_id')::uuid;
  entity := nullif(row_data->>'id','')::uuid;
  related_chat := case when tg_table_name = 'chats' then entity else nullif(row_data->>'chat_id','')::uuid end;
  insert into public.inbox_events(workspace_id,event_type,entity_id,chat_id,payload)
  values (ws, tg_table_name || '.' || lower(tg_op), entity, related_chat, row_data);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists emit_chat_event on public.chats;
create trigger emit_chat_event after insert or update or delete on public.chats
for each row execute function public.emit_inbox_event();
drop trigger if exists emit_message_event on public.messages;
create trigger emit_message_event after insert or update or delete on public.messages
for each row execute function public.emit_inbox_event();
drop trigger if exists emit_instance_event on public.whatsapp_instances;
create trigger emit_instance_event after insert or update or delete on public.whatsapp_instances
for each row execute function public.emit_inbox_event();
drop trigger if exists emit_presence_event on public.whatsapp_presence;
create trigger emit_presence_event after insert or update or delete on public.whatsapp_presence
for each row execute function public.emit_inbox_event();
drop trigger if exists emit_contact_event on public.whatsapp_contacts;
create trigger emit_contact_event after insert or update or delete on public.whatsapp_contacts
for each row execute function public.emit_inbox_event();

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
  where workspace_id=p_workspace_id and instance_name=p_instance_name;
  if v_instance_id is null then raise exception 'owned instance not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_instance_name || ':' || p_phone, 0));
  select * into v_chat from public.chats
  where workspace_id=p_workspace_id and instance_name=p_instance_name and phone=p_phone
  for update;

  v_preview := case p_type when 'text' then coalesce(p_text,'') when 'image' then 'Foto' when 'video' then 'Vídeo' when 'audio' then 'Áudio' when 'document' then 'Documento' when 'sticker' then 'Figurinha' else 'Mensagem apagada' end;

  if v_chat.id is null then
    insert into public.chats(workspace_id,instance_id,instance_name,phone,phone_e164,remote_jid,identity_kind,name,profile_pic_url,last_message,last_message_type,last_message_at,unread,is_group)
    values(p_workspace_id,v_instance_id,p_instance_name,p_phone,case when p_identity_kind='phone' then p_phone else null end,p_remote_jid,p_identity_kind,p_name,p_profile_pic_url,v_preview,p_type,p_created_at,case when p_increment_unread then 1 else 0 end,p_is_group)
    returning * into v_chat;
  end if;

  if p_external_id is not null then
    select * into v_message from public.messages where workspace_id=p_workspace_id and external_id=p_external_id;
  elsif p_client_message_id is not null then
    select * into v_message from public.messages where workspace_id=p_workspace_id and client_message_id=p_client_message_id;
  end if;

  if v_message.id is null then
    insert into public.messages(workspace_id,instance_id,chat_id,remote_jid,external_id,client_message_id,sender,sender_name,sender_phone,sender_avatar,quoted_message,type,text,media_url,media_mimetype,media_filename,media_duration,status,created_at)
    values(p_workspace_id,v_instance_id,v_chat.id,p_remote_jid,p_external_id,p_client_message_id,p_sender,p_sender_name,p_sender_phone,p_sender_avatar,p_quoted_message,case when p_type='deleted' then 'text' else p_type end,case when p_type='deleted' then 'Mensagem apagada' else p_text end,p_media_url,p_media_mimetype,p_media_filename,p_media_duration,p_status,p_created_at)
    returning * into v_message;
    v_inserted := true;

    if v_chat.last_message_at <= p_created_at then
      update public.chats set
        instance_id=v_instance_id,
        remote_jid=coalesce(p_remote_jid,remote_jid),
        identity_kind=coalesce(p_identity_kind,identity_kind),
        phone_e164=case when p_identity_kind='phone' then p_phone else phone_e164 end,
        name=coalesce(nullif(p_name,''),name),
        profile_pic_url=coalesce(nullif(p_profile_pic_url,''),profile_pic_url),
        last_message=v_preview,last_message_type=p_type,last_message_at=p_created_at,
        unread=unread + case when p_increment_unread then 1 else 0 end,
        is_group=p_is_group
      where id=v_chat.id returning * into v_chat;
    end if;
  end if;

  return jsonb_build_object('chat_id',v_chat.id,'message',to_jsonb(v_message),'inserted',v_inserted,'duplicated',not v_inserted);
end;
$$;
revoke all on function public.persist_inbox_message(uuid,text,text,text,text,text,text,boolean,text,text,text,text,jsonb,text,text,text,text,text,integer,text,uuid,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.persist_inbox_message(uuid,text,text,text,text,text,text,boolean,text,text,text,text,jsonb,text,text,text,text,text,integer,text,uuid,text,timestamptz,boolean) to service_role;

create or replace function public.mark_chat_read(p_workspace_id uuid, p_chat_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_chat public.chats%rowtype;
begin
  update public.chats set unread=0 where id=p_chat_id and workspace_id=p_workspace_id returning * into v_chat;
  if v_chat.id is null then raise exception 'owned chat not found'; end if;
  update public.messages set read_local_at=coalesce(read_local_at,now()) where chat_id=p_chat_id and workspace_id=p_workspace_id and sender='client' and read_local_at is null;
  return to_jsonb(v_chat);
end;
$$;
revoke all on function public.mark_chat_read(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mark_chat_read(uuid,uuid) to service_role;

update storage.buckets set public=false where id='chat-media';
