-- Per-member permission overrides for workspace invitations and staff access.
-- Overrides are restrictive: a member can lose capabilities from its role
-- profile, but cannot gain permissions above that profile.

alter table public.workspace_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.workspace_invitations
  add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.workspace_members
    drop constraint if exists workspace_members_permissions_object_check;
  alter table public.workspace_members
    add constraint workspace_members_permissions_object_check
    check (jsonb_typeof(permissions) = 'object');

  alter table public.workspace_invitations
    drop constraint if exists workspace_invitations_permissions_object_check;
  alter table public.workspace_invitations
    add constraint workspace_invitations_permissions_object_check
    check (jsonb_typeof(permissions) = 'object');
end $$;

create index if not exists workspace_members_permissions_gin_idx
  on public.workspace_members using gin (permissions);
