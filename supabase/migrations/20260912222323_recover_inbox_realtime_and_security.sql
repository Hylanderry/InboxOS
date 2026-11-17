-- Inbox recovery: persistent WhatsApp identity, realtime presence and strict tenant isolation.

create schema if not exists private;

alter table public.chats
  add column if not exists is_announcement boolean not null default false,
  add column if not exists can_send boolean not null default true,
  add column if not exists is_admin boolean not null default false,
  add column if not exists group_metadata jsonb not null default '{}'::jsonb;

alter table public.messages
  add column if not exists is_edited boolean not null default false,
  add column if not exists reactions jsonb not null default '[]'::jsonb,
  add column if not exists is_gif boolean not null default false;

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'video', 'audio', 'document', 'sticker', 'deleted'));

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_name text not null,
  remote_jid text not null,
  alternate_jid text,
  phone text,
  saved_name text,
  push_name text,
  profile_pic_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, instance_name, remote_jid)
);

create index if not exists idx_whatsapp_contacts_phone
  on public.whatsapp_contacts(workspace_id, instance_name, phone);
create index if not exists idx_whatsapp_contacts_alt_jid
  on public.whatsapp_contacts(workspace_id, instance_name, alternate_jid);

create table if not exists public.whatsapp_presence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_name text not null,
  phone text not null,
  state text not null check (state in ('available', 'unavailable', 'composing', 'recording', 'paused')),
  updated_at timestamptz not null default now(),
  unique (workspace_id, instance_name, phone)
);

create or replace function private.user_has_workspace_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
  );
$$;

revoke all on function private.user_has_workspace_access(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.user_has_workspace_access(uuid) to authenticated;

-- Bootstrap the recovered single-owner project without granting later users access.
insert into public.workspace_members (workspace_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', user_row.id, 'owner'
from auth.users user_row
order by user_row.created_at asc
limit 1
on conflict (workspace_id, user_id) do nothing;

-- If the recovered project still has no Auth user, the first account created
-- becomes its owner. Later sign-ups receive no workspace access automatically.
create or replace function private.bootstrap_first_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform pg_advisory_xact_lock(hashtext('bootstrap_first_workspace_owner'));
  if not exists (select 1 from public.workspace_members) then
    insert into public.workspace_members (workspace_id, user_id, role)
    values ('00000000-0000-0000-0000-000000000001', new.id, 'owner')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists bootstrap_first_workspace_owner on auth.users;
create trigger bootstrap_first_workspace_owner
  after insert on auth.users
  for each row execute function private.bootstrap_first_workspace_owner();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.whatsapp_instances enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_presence enable row level security;

do $$
declare
  policy_row record;
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
    'workspace_members',
    'whatsapp_instances',
    'chats',
    'messages',
    'whatsapp_contacts',
    'whatsapp_presence'
  ]
  loop
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
    end loop;
  end loop;
end $$;

create policy "members read their workspace"
  on public.workspaces for select to authenticated
  using (private.user_has_workspace_access(id));

create policy "members read workspace membership"
  on public.workspace_members for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

create policy "members read workspace instances"
  on public.whatsapp_instances for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

create policy "members read workspace chats"
  on public.chats for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

create policy "members read workspace messages"
  on public.messages for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

create policy "members read workspace contacts"
  on public.whatsapp_contacts for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

create policy "members read workspace presence"
  on public.whatsapp_presence for select to authenticated
  using (private.user_has_workspace_access(workspace_id));

revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
revoke all on public.whatsapp_instances from anon;
revoke all on public.chats from anon;
revoke all on public.messages from anon;
revoke all on public.whatsapp_contacts from anon;
revoke all on public.whatsapp_presence from anon;

grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select on public.whatsapp_instances to authenticated;
grant select on public.chats to authenticated;
grant select on public.messages to authenticated;
grant select on public.whatsapp_contacts to authenticated;
grant select on public.whatsapp_presence to authenticated;
grant all on public.whatsapp_contacts to service_role;
grant all on public.whatsapp_presence to service_role;

create or replace function public.increment_chat_unread(
  p_chat_id uuid,
  p_workspace_id uuid,
  p_amount integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  update public.chats
  set unread = greatest(0, unread + p_amount)
  where id = p_chat_id and workspace_id = p_workspace_id
  returning unread into next_value;
  return coalesce(next_value, 0);
end;
$$;

revoke all on function public.increment_chat_unread(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_chat_unread(uuid, uuid, integer) to service_role;

-- Contacts imported by the previous implementation are not conversations.
delete from public.chats chat
where chat.is_group = false
  and chat.last_message = 'Conversa iniciada'
  and not exists (select 1 from public.messages message where message.chat_id = chat.id);

create unique index if not exists idx_whatsapp_instances_global_name
  on public.whatsapp_instances(instance_name);

create index if not exists idx_chats_group_state
  on public.chats(workspace_id, instance_name, is_group, archived);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_contacts'
  ) then
    alter publication supabase_realtime add table public.whatsapp_contacts;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_presence'
  ) then
    alter publication supabase_realtime add table public.whatsapp_presence;
  end if;
end $$;
