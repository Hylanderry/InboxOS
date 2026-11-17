create unique index if not exists automation_agent_runs_agent_trigger_uidx on public.automation_agent_runs(agent_id, trigger_message_id) where trigger_message_id is not null;
create unique index if not exists automation_agents_one_auto_global_uidx on public.automation_agents(workspace_id) where enabled = true and reply_mode = 'automatic' and instance_id is null;
create unique index if not exists automation_agents_one_auto_instance_uidx on public.automation_agents(workspace_id, instance_id) where enabled = true and reply_mode = 'automatic' and instance_id is not null;
create unique index if not exists workspace_billing_provider_customer_uidx on public.workspace_billing(provider, external_customer_id) where provider is not null and external_customer_id is not null;
create unique index if not exists workspace_billing_provider_subscription_uidx on public.workspace_billing(provider, external_subscription_id) where provider is not null and external_subscription_id is not null;
