-- Atomic bootstrap claim. Caller still must enforce SYSTEM_ADMIN_BOOTSTRAP_EMAILS before invoking.
create or replace function public.claim_system_admin_bootstrap(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare active_count bigint;
begin
  perform pg_advisory_xact_lock(hashtext('inboxos-system-admin-bootstrap'));
  select count(*) into active_count from public.system_admins where status='active';
  if active_count>0 then return false; end if;
  insert into public.system_admins(user_id,role,status,created_by)
  values(p_user_id,'superadmin','active',p_user_id)
  on conflict(user_id) do update set role='superadmin',status='active',updated_at=now();
  return true;
end;
$$;
revoke all on function public.claim_system_admin_bootstrap(uuid) from public,anon,authenticated;
grant execute on function public.claim_system_admin_bootstrap(uuid) to service_role;
