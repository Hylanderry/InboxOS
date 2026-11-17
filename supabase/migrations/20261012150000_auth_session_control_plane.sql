-- Idempotent auth/control-plane tables required by the server session,
-- trusted-device and workspace-invitation flows. Production application is
-- deliberately outside this migration's scope until isolated staging passes.
create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'agent' check (role in ('agent','admin')),
  token_hash text not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  fingerprint_hash text,
  display_name text,
  device_family text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  user_agent text,
  first_ip inet,
  last_ip inet,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  trusted_until timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.user_devices(id) on delete set null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  last_ip inet,
  user_agent text,
  last_workspace_id uuid references public.workspaces(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists workspace_invitations_pending_unique
  on public.workspace_invitations(workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;
create unique index if not exists user_devices_user_token_unique
  on public.user_devices(user_id, device_token_hash);
create unique index if not exists user_sessions_token_hash_unique
  on public.user_sessions(token_hash);
create index if not exists user_devices_user_last_seen_idx
  on public.user_devices(user_id, last_seen_at desc);
create index if not exists user_sessions_user_last_seen_idx
  on public.user_sessions(user_id, last_seen_at desc);
create index if not exists user_sessions_active_idx
  on public.user_sessions(user_id, expires_at)
  where revoked_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array['workspace_invitations','user_devices','user_sessions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('drop policy if exists service_role_backend_access on public.%I', table_name);
    execute format('create policy service_role_backend_access on public.%I for all to service_role using (true) with check (true)', table_name);
  end loop;
end $$;
