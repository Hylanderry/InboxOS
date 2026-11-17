-- Runtime repair for privacy queue operations.
-- Additive and idempotent: no user or workspace data is removed by this migration.

-- The worker uses `manual_review` for correction requests. Older installations
-- created the status check before that state existed, causing the worker's
-- update to fail at runtime. Reassert the complete state machine explicitly.
alter table if exists public.workspace_data_requests
  drop constraint if exists workspace_data_requests_status_check;

alter table if exists public.workspace_data_requests
  add constraint workspace_data_requests_status_check
  check (status in ('pending', 'processing', 'manual_review', 'completed', 'rejected', 'failed'));

-- Supabase RPC calls use the configured API schema (public by default). Keep
-- the implementation in the private schema and expose only a service-role
-- wrapper so authenticated/anonymous clients cannot invoke destructive cleanup.
create or replace function public.execute_privacy_workspace_delete(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;
  return private.execute_privacy_workspace_delete(p_workspace_id);
end;
$$;

revoke all on function public.execute_privacy_workspace_delete(uuid)
  from public, anon, authenticated;
grant execute on function public.execute_privacy_workspace_delete(uuid) to service_role;
