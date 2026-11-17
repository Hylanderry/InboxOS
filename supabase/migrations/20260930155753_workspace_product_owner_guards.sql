alter table public.crm_leads
  add constraint crm_leads_workspace_owner_fkey
  foreign key (workspace_id, owner_user_id)
  references public.workspace_members(workspace_id, user_id)
  on delete set null (owner_user_id);

alter table public.follow_up_tasks
  add constraint follow_up_tasks_workspace_owner_fkey
  foreign key (workspace_id, owner_user_id)
  references public.workspace_members(workspace_id, user_id)
  on delete set null (owner_user_id);
