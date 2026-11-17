-- White-label and privacy controls.
-- Additive migration: does not delete operational data and is safe to rerun.

create table if not exists public.workspace_company_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  legal_name text not null,
  trade_name text,
  tax_country text not null default 'BR',
  tax_id_type text not null default 'CNPJ',
  tax_id text not null,
  tax_id_normalized text not null,
  tax_status text not null default 'unverified',
  tax_verified_at timestamptz,
  phone_e164 text,
  country_code text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_company_profiles enable row level security;
revoke all on table public.workspace_company_profiles from anon, authenticated;
grant all on table public.workspace_company_profiles to service_role;
drop policy if exists service_role_workspace_company_profiles on public.workspace_company_profiles;
create policy service_role_workspace_company_profiles on public.workspace_company_profiles
  for all to service_role using (true) with check (true);

-- Reassert the privacy boundary after legacy realtime migrations. Those
-- migrations once granted SELECT to anon so the browser could subscribe to
-- tables directly; the application now uses authenticated, workspace-scoped
-- access only. Keeping this revocation in the latest migration makes a fresh
-- install and an upgraded database converge to the same boundary.
do $$
declare
  t text;
begin
  foreach t in array array[
    'whatsapp_instances',
    'chats',
    'messages',
    'whatsapp_contacts',
    'whatsapp_presence'
  ] loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

alter table if exists public.workspace_company_profiles
  add column if not exists brand_name text,
  add column if not exists logo_light_path text,
  add column if not exists logo_dark_path text,
  add column if not exists favicon_path text,
  add column if not exists support_email text,
  add column if not exists sender_name text,
  add column if not exists accent_token text not null default 'neutral',
  add column if not exists white_label_enabled boolean not null default false,
  add column if not exists custom_domain text,
  add column if not exists custom_domain_status text not null default 'not_configured';

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_media_service_role on storage.objects;
create policy profile_media_service_role on storage.objects
  for all to service_role
  using (bucket_id = 'profile-media')
  with check (bucket_id = 'profile-media');

do $$
begin
  if to_regclass('public.workspace_company_profiles') is not null then
    alter table public.workspace_company_profiles
      drop constraint if exists workspace_company_profiles_accent_token_check;
    alter table public.workspace_company_profiles
      add constraint workspace_company_profiles_accent_token_check
      check (accent_token in ('neutral', 'teal', 'indigo', 'amber'));
    alter table public.workspace_company_profiles
      drop constraint if exists workspace_company_profiles_domain_status_check;
    alter table public.workspace_company_profiles
      add constraint workspace_company_profiles_domain_status_check
      check (custom_domain_status in ('not_configured', 'pending', 'verified', 'rejected'));
  end if;
end $$;

create table if not exists public.workspace_privacy_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  import_history_policy text not null default 'from_connection_time'
    check (import_history_policy in ('none', 'from_connection_time')),
  message_retention_days integer not null default 90
    check (message_retention_days between 1 and 3650),
  media_retention_days integer not null default 30
    check (media_retention_days between 1 and 3650),
  disconnect_cleanup_policy text not null default 'purge'
    check (disconnect_cleanup_policy in ('purge', 'retain')),
  ai_enabled boolean not null default false,
  pii_redaction_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.workspace_privacy_settings
  add column if not exists disconnect_cleanup_policy text not null default 'purge';

do $$
begin
  if to_regclass('public.workspace_privacy_settings') is not null then
    alter table public.workspace_privacy_settings
      drop constraint if exists workspace_privacy_settings_disconnect_cleanup_policy_check;
    alter table public.workspace_privacy_settings
      add constraint workspace_privacy_settings_disconnect_cleanup_policy_check
      check (disconnect_cleanup_policy in ('purge', 'retain'));
  end if;
end $$;

create table if not exists public.workspace_data_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('export', 'delete', 'correct')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'rejected', 'failed')),
  reason text,
  result_path text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  execute_after timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  result_expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.workspace_data_requests
  add column if not exists execute_after timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists result_expires_at timestamptz,
  add column if not exists error_message text;

create table if not exists public.workspace_audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  request_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists workspace_data_requests_workspace_created_idx
  on public.workspace_data_requests(workspace_id, created_at desc);
create index if not exists workspace_data_requests_queue_idx
  on public.workspace_data_requests(status, execute_after, created_at);
create index if not exists workspace_audit_log_workspace_created_idx
  on public.workspace_audit_log(workspace_id, created_at desc);

-- Export files are private. They are only reachable through a short-lived
-- signed URL created after the requesting user passes workspace authorization.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('privacy-exports', 'privacy-exports', false, 52428800, array['application/json']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists privacy_exports_service_read on storage.objects;
drop policy if exists privacy_exports_service_write on storage.objects;
drop policy if exists privacy_exports_service_update on storage.objects;
drop policy if exists privacy_exports_service_delete on storage.objects;
create policy privacy_exports_service_read
  on storage.objects for select to service_role
  using (bucket_id = 'privacy-exports');
create policy privacy_exports_service_write
  on storage.objects for insert to service_role
  with check (bucket_id = 'privacy-exports');
create policy privacy_exports_service_update
  on storage.objects for update to service_role
  using (bucket_id = 'privacy-exports') with check (bucket_id = 'privacy-exports');
create policy privacy_exports_service_delete
  on storage.objects for delete to service_role
  using (bucket_id = 'privacy-exports');

do $$
declare
  t text;
begin
  foreach t in array array['workspace_privacy_settings', 'workspace_data_requests', 'workspace_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists service_role_backend_access on public.%I', t);
    execute format('create policy service_role_backend_access on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

grant usage, select on sequence public.workspace_audit_log_id_seq to service_role;

-- Destructive workspace cleanup runs inside one database transaction. The
-- worker calls this only after the recovery window elapsed and after private
-- storage objects were removed. Keeping the function outside the public
-- schema prevents an authenticated client from invoking it directly.
create or replace function private.execute_privacy_workspace_delete(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count bigint;
  v_result jsonb := '{}'::jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace is required';
  end if;

  delete from public.messages where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('messages', v_count);

  delete from public.calendar_appointments where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('calendar_appointments', v_count);

  delete from public.crm_lead_tags where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('crm_lead_tags', v_count);

  delete from public.follow_up_tasks where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('follow_up_tasks', v_count);

  delete from public.automation_agent_runs where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('automation_agent_runs', v_count);

  delete from public.automation_agents where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('automation_agents', v_count);

  delete from public.crm_leads where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('crm_leads', v_count);

  delete from public.crm_stages where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('crm_stages', v_count);

  delete from public.crm_tags where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('crm_tags', v_count);

  delete from public.calendar_calendars where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('calendar_calendars', v_count);

  delete from public.outbound_messages where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('outbound_messages', v_count);

  delete from public.group_participants where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('group_participants', v_count);

  delete from public.contact_identity_aliases where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('contact_identity_aliases', v_count);

  delete from public.whatsapp_presence where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('whatsapp_presence', v_count);

  delete from public.whatsapp_contacts where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('whatsapp_contacts', v_count);

  delete from public.handover_requests where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('handover_requests', v_count);

  delete from public.evolution_events where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('evolution_events', v_count);

  delete from public.inbox_events where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('inbox_events', v_count);

  delete from public.chats where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('chats', v_count);

  delete from public.whatsapp_instances where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('whatsapp_instances', v_count);

  delete from public.workspace_invitations where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workspace_invitations', v_count);

  delete from public.workspace_company_profiles where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workspace_company_profiles', v_count);

  delete from public.workspace_privacy_settings where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workspace_privacy_settings', v_count);

  delete from public.workspace_billing where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workspace_billing', v_count);

  delete from public.workspace_members where workspace_id = p_workspace_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('workspace_members', v_count);

  update public.workspaces
  set status = 'deleted', name = 'Workspace excluído', updated_at = now()
  where id = p_workspace_id;
  return v_result;
end;
$$;

revoke all on function private.execute_privacy_workspace_delete(uuid) from public, anon, authenticated;
grant execute on function private.execute_privacy_workspace_delete(uuid) to service_role;

drop trigger if exists touch_workspace_privacy_settings_updated_at on public.workspace_privacy_settings;
create trigger touch_workspace_privacy_settings_updated_at
  before update on public.workspace_privacy_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_workspace_data_requests_updated_at on public.workspace_data_requests;
create trigger touch_workspace_data_requests_updated_at
  before update on public.workspace_data_requests
  for each row execute function public.touch_updated_at();
