create index if not exists follow_up_workspace_owner_idx
  on public.follow_up_tasks(workspace_id, owner_user_id)
  where owner_user_id is not null;
