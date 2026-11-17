-- Reconciliation of the already-applied migration 20261001134743 in the live
-- Supabase migration history. This is not a request to re-run against live DB.
-- Verified using pg_get_functiondef / pg_proc ACL read-only on 2026-10-02.
-- Security-invoker function; service_role is the only exposed caller.
create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_from_user_id uuid,
  p_to_user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  if p_workspace_id is null or p_from_user_id is null or p_to_user_id is null
     or p_from_user_id = p_to_user_id then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('inboxos-owner-transfer'), hashtext(p_workspace_id::text));

  select m.id into v_old_id
  from public.workspace_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.workspace_id = p_workspace_id
    and w.status = 'active'
    and m.user_id = p_from_user_id
    and m.role = 'owner'
    and m.status = 'active'
  for update of m;
  if v_old_id is null then return false; end if;

  select m.id into v_new_id
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = p_to_user_id
    and m.status = 'active'
  for update of m;
  if v_new_id is null then return false; end if;

  update public.workspace_members set role = 'owner' where id = v_new_id;
  update public.workspace_members set role = 'admin' where id = v_old_id;
  return true;
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.transfer_workspace_ownership(uuid,uuid,uuid) to service_role;
