create unique index if not exists crm_stages_workspace_id_id_uidx on public.crm_stages(workspace_id, id);
create unique index if not exists crm_leads_workspace_id_id_uidx on public.crm_leads(workspace_id, id);
create unique index if not exists automation_agents_workspace_id_id_uidx on public.automation_agents(workspace_id, id);
create unique index if not exists chats_workspace_id_id_uidx on public.chats(workspace_id, id);
create unique index if not exists whatsapp_contacts_workspace_id_id_uidx on public.whatsapp_contacts(workspace_id, id);
create unique index if not exists messages_workspace_id_id_uidx on public.messages(workspace_id, id);

alter table public.crm_leads add constraint crm_leads_workspace_stage_fkey foreign key (workspace_id, stage_id) references public.crm_stages(workspace_id, id) on delete restrict;
alter table public.crm_leads add constraint crm_leads_workspace_chat_fkey foreign key (workspace_id, chat_id) references public.chats(workspace_id, id) on delete set null (chat_id);
alter table public.crm_leads add constraint crm_leads_workspace_contact_fkey foreign key (workspace_id, contact_id) references public.whatsapp_contacts(workspace_id, id) on delete set null (contact_id);
alter table public.follow_up_tasks add constraint follow_up_tasks_workspace_lead_fkey foreign key (workspace_id, lead_id) references public.crm_leads(workspace_id, id) on delete cascade;
alter table public.follow_up_tasks add constraint follow_up_tasks_workspace_chat_fkey foreign key (workspace_id, chat_id) references public.chats(workspace_id, id) on delete set null (chat_id);
alter table public.automation_agents add constraint automation_agents_workspace_instance_fkey foreign key (workspace_id, instance_id) references public.whatsapp_instances(workspace_id, id) on delete set null (instance_id);
alter table public.automation_agent_runs add constraint automation_agent_runs_workspace_agent_fkey foreign key (workspace_id, agent_id) references public.automation_agents(workspace_id, id) on delete cascade;
alter table public.automation_agent_runs add constraint automation_agent_runs_workspace_chat_fkey foreign key (workspace_id, chat_id) references public.chats(workspace_id, id) on delete set null (chat_id);
alter table public.automation_agent_runs add constraint automation_agent_runs_workspace_trigger_message_fkey foreign key (workspace_id, trigger_message_id) references public.messages(workspace_id, id) on delete set null (trigger_message_id);
