-- Historical migration already applied on the connected Supabase project.
-- System administrators are distinct from workspace owner/admin/agent.
alter table public.workspaces add column if not exists status text not null default 'active', add column if not exists suspended_at timestamptz, add column if not exists suspended_reason text;
alter table public.workspaces drop constraint if exists workspaces_status_check;
alter table public.workspaces add constraint workspaces_status_check check(status in ('active','suspended','archived'));
create index if not exists workspaces_status_idx on public.workspaces(status,updated_at desc);
create table if not exists public.system_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check(status in ('active','suspended')),
  suspended_at timestamptz,suspended_reason text,admin_note text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('superadmin','operator','support','auditor')),
  status text not null default 'active' check(status in ('active','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.system_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,action text not null,target_type text not null,target_id text,
  workspace_id uuid references public.workspaces(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,request_ip inet,user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists system_admins_role_status_idx on public.system_admins(status,role);
create index if not exists system_user_controls_status_idx on public.system_user_controls(status,updated_at desc);
create index if not exists system_admin_audit_created_idx on public.system_admin_audit_log(created_at desc);
create index if not exists system_admin_audit_actor_idx on public.system_admin_audit_log(actor_user_id,created_at desc) where actor_user_id is not null;
create index if not exists system_admin_audit_workspace_idx on public.system_admin_audit_log(workspace_id,created_at desc) where workspace_id is not null;
drop trigger if exists touch_system_user_controls_updated_at on public.system_user_controls;
create trigger touch_system_user_controls_updated_at before update on public.system_user_controls for each row execute function public.touch_updated_at();
drop trigger if exists touch_system_admins_updated_at on public.system_admins;
create trigger touch_system_admins_updated_at before update on public.system_admins for each row execute function public.touch_updated_at();
DO $$ declare t text; begin
 foreach t in array array['system_user_controls','system_admins','system_admin_audit_log'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on table public.%I from anon,authenticated',t);
   execute format('grant all on table public.%I to service_role',t);
   execute format('drop policy if exists service_role_backend_access on public.%I',t);
   execute format('create policy service_role_backend_access on public.%I for all to service_role using(true) with check(true)',t);
 end loop;
end $$;
grant usage,select on sequence public.system_admin_audit_log_id_seq to service_role;
create or replace function private.user_has_workspace_access(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public,auth
as $$
 select not exists(select 1 from public.system_user_controls c where c.user_id=auth.uid() and c.status='suspended')
 and exists(select 1 from public.workspaces w where w.id=target_workspace_id and w.status='active')
 and exists(select 1 from public.workspace_members m where m.workspace_id=target_workspace_id and m.user_id=auth.uid() and m.status='active')
$$;
revoke all on function private.user_has_workspace_access(uuid) from public;
grant execute on function private.user_has_workspace_access(uuid) to authenticated;
