-- Auth/multi-tenant foundation recovered for reproducible staging installs.
-- Idempotent and additive: existing live objects are preserved.

create schema if not exists private;

alter table public.workspaces
  add column if not exists kind text not null default 'workspace',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.workspace_members
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.workspace_members drop constraint if exists workspace_members_status_check;
  alter table public.workspace_members add constraint workspace_members_status_check
    check (status in ('active', 'suspended', 'removed'));
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_kind text not null default 'person',
  first_name text,
  last_name text,
  email text not null,
  phone_e164 text,
  country_code text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  account_kind text not null default 'person',
  first_name text,
  last_name text,
  company_name text,
  tax_country text,
  tax_id_type text,
  tax_id text,
  tax_id_normalized text,
  phone_e164 text,
  country_code text,
  initial_password_hash text not null,
  terms_document_id uuid,
  privacy_document_id uuid,
  invitation_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  pending_registration_id uuid references public.pending_registrations(id) on delete cascade,
  purpose text not null,
  target_email text not null,
  target_email_hash text not null,
  code_hash text not null,
  device_scope_hash text,
  request_ip inet,
  user_agent text,
  send_count integer not null default 1 check (send_count >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  blocked_until timestamptz,
  verified_at timestamptz,
  grant_token_hash text,
  grant_expires_at timestamptz,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.password_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  device_id uuid,
  event_type text not null,
  severity text not null default 'info',
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  subject_type text,
  subject_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.system_events(id) on delete set null,
  channel text not null,
  template_key text not null,
  recipient text,
  status text not null default 'pending',
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz
);

create table if not exists public.auth_rate_limits (
  action text not null,
  scope_hash text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (action, scope_hash)
);

create index if not exists pending_registrations_email_idx
  on public.pending_registrations(lower(email), expires_at desc);
create index if not exists email_challenges_scope_idx
  on public.email_challenges(purpose, target_email_hash, created_at desc);
create index if not exists email_challenges_pending_idx
  on public.email_challenges(pending_registration_id, created_at desc);
create index if not exists password_history_user_idx
  on public.password_history(user_id, created_at desc);
create index if not exists security_events_user_idx
  on public.security_events(user_id, created_at desc);
create index if not exists system_events_pending_idx
  on public.system_events(processed_at, created_at);
create index if not exists notification_deliveries_event_idx
  on public.notification_deliveries(event_id, created_at desc);

create or replace function public.lookup_auth_user_by_email(p_email text)
returns table(user_id uuid, email_confirmed_at timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select u.id, u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1
$$;

create or replace function public.consume_auth_rate_limit(
  p_action text,
  p_scope_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer, attempt_count integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.auth_rate_limits%rowtype;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(1, p_window_seconds));
  v_block interval := make_interval(secs => greatest(1, p_block_seconds));
  v_allowed boolean;
  v_retry integer := 0;
begin
  if nullif(trim(p_action), '') is null or nullif(trim(p_scope_hash), '') is null
     or p_limit <= 0 or p_window_seconds <= 0 or p_block_seconds <= 0 then
    raise exception 'invalid rate limit arguments';
  end if;
  insert into public.auth_rate_limits(action, scope_hash, window_started_at, attempt_count, updated_at)
  values (p_action, p_scope_hash, v_now, 1, v_now)
  on conflict (action, scope_hash) do update set
    window_started_at = case
      when public.auth_rate_limits.window_started_at + v_window <= v_now then v_now
      else public.auth_rate_limits.window_started_at
    end,
    attempt_count = case
      when public.auth_rate_limits.window_started_at + v_window <= v_now then 1
      else public.auth_rate_limits.attempt_count + 1
    end,
    blocked_until = case
      when public.auth_rate_limits.window_started_at + v_window <= v_now then null
      else public.auth_rate_limits.blocked_until
    end,
    updated_at = v_now
  returning * into v_row;

  v_allowed := v_row.blocked_until is null and v_row.attempt_count <= p_limit;
  if not v_allowed then
    if v_row.blocked_until is null then
      update public.auth_rate_limits
      set blocked_until = v_now + v_block, updated_at = v_now
      where action = p_action and scope_hash = p_scope_hash;
      v_row.blocked_until := v_now + v_block;
    end if;
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
  end if;
  return query select v_allowed, v_retry, v_row.attempt_count;
end;
$$;

create or replace function public.claim_email_challenge(p_challenge_id uuid, p_code_hash text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.email_challenges
  set verified_at = now(), grant_expires_at = now() + interval '10 minutes'
  where id = p_challenge_id
    and code_hash = p_code_hash
    and consumed_at is null
    and verified_at is null
    and expires_at > now()
    and (blocked_until is null or blocked_until <= now());
  return found;
end;
$$;

revoke all on function public.lookup_auth_user_by_email(text) from public, anon, authenticated;
revoke all on function public.consume_auth_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_email_challenge(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_auth_user_by_email(text) to service_role;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;
grant execute on function public.claim_email_challenge(uuid, text) to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'pending_registrations', 'email_challenges', 'password_history',
    'security_events', 'system_events', 'notification_deliveries', 'auth_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists service_role_backend_access on public.%I', t);
    execute format('create policy service_role_backend_access on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
