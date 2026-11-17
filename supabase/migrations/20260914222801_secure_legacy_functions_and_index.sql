-- Remove inherited execution access from maintenance/helper functions.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.user_has_workspace_access(uuid) from public, anon, authenticated;

create index if not exists idx_workspace_members_user_id
  on public.workspace_members(user_id);
