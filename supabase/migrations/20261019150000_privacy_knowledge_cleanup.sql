-- Complete the privacy export/delete boundary for the workspace knowledge base.
-- This migration intentionally runs after 20261019140000_workspace_knowledge_base.sql.

create or replace function private.cleanup_deleted_workspace_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    delete from public.workspace_knowledge_documents
    where workspace_id = old.id;
  end if;
  return new;
end;
$$;

revoke all on function private.cleanup_deleted_workspace_knowledge() from public, anon, authenticated;
grant execute on function private.cleanup_deleted_workspace_knowledge() to service_role;

drop trigger if exists cleanup_deleted_workspace_knowledge on public.workspaces;
create trigger cleanup_deleted_workspace_knowledge
  before update of status on public.workspaces
  for each row execute function private.cleanup_deleted_workspace_knowledge();
