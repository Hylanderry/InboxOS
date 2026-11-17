-- Repair: the 20260915120000 migration granted every new account membership
-- in the legacy default workspace. That made the owner's WhatsApp visible to
-- unrelated signups. Remove those legacy grants and stop the auto-membership
-- trigger. Normal registration and invitation flows create their own scoped
-- workspace membership explicitly.

do $$
begin
  if to_regclass('public.workspace_members') is null then
    raise exception 'workspace_members table is required before isolation repair';
  end if;
end $$;

-- The default workspace is legacy data. Any agent membership there created by
-- the faulty auto-grant is unsafe; owners can invite legitimate staff again
-- through the workspace invitation flow after this repair.
delete from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
  and role = 'agent';

-- Future signups must never inherit a workspace. The application registration
-- RPC and invitation acceptance are the only supported membership paths.
create or replace function private.bootstrap_first_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return new;
end;
$$;

-- Keep the function callable only by the trigger mechanism/service role.
revoke all on function private.bootstrap_first_workspace_owner() from public;

