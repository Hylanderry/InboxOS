create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, color text not null default '#71717a', position integer not null default 0 check (position >= 0),
  kind text not null default 'open' check (kind in ('open','won','lost')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, name), check (char_length(name) between 1 and 80), check (color ~ '^#[0-9A-Fa-f]{6}$')
);
create index if not exists crm_stages_workspace_position_idx on public.crm_stages(workspace_id, position, created_at);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage_id uuid not null references public.crm_stages(id) on delete restrict, chat_id uuid references public.chats(id) on delete set null,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null, name text not null, phone_e164 text, email text, company text,
  value_cents bigint not null default 0 check (value_cents >= 0), currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  source text not null default 'manual' check (source in ('manual','inbox','import','api')), owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, notes text, last_contact_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (char_length(name) between 1 and 160), check (email is null or char_length(email) <= 320), check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
create index if not exists crm_leads_workspace_stage_idx on public.crm_leads(workspace_id, stage_id, updated_at desc);
create index if not exists crm_leads_workspace_owner_idx on public.crm_leads(workspace_id, owner_user_id) where owner_user_id is not null;
create index if not exists crm_leads_workspace_phone_idx on public.crm_leads(workspace_id, phone_e164) where phone_e164 is not null;
create unique index if not exists crm_leads_workspace_chat_uidx on public.crm_leads(workspace_id, chat_id) where chat_id is not null;

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete cascade, chat_id uuid references public.chats(id) on delete set null,
  title text not null, note text, due_at timestamptz not null, status text not null default 'pending' check (status in ('pending','done','canceled')),
  priority text not null default 'normal' check (priority in ('low','normal','high')), owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (char_length(title) between 1 and 200)
);
create index if not exists follow_up_workspace_due_idx on public.follow_up_tasks(workspace_id, status, due_at);
create index if not exists follow_up_workspace_lead_idx on public.follow_up_tasks(workspace_id, lead_id) where lead_id is not null;

create table if not exists public.automation_agents (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null, name text not null, enabled boolean not null default false,
  provider text not null default 'groq' check (provider in ('groq')), model text, instructions text not null,
  temperature numeric(3,2) not null default 0.30 check (temperature >= 0 and temperature <= 2),
  max_completion_tokens integer not null default 700 check (max_completion_tokens between 64 and 8192),
  reply_mode text not null default 'manual' check (reply_mode in ('manual','automatic')), allow_groups boolean not null default false,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, name), check (char_length(name) between 1 and 100), check (char_length(instructions) between 1 and 12000)
);
create index if not exists automation_agents_workspace_enabled_idx on public.automation_agents(workspace_id, enabled, reply_mode);
create index if not exists automation_agents_instance_idx on public.automation_agents(workspace_id, instance_id) where instance_id is not null;

create table if not exists public.automation_agent_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.automation_agents(id) on delete cascade, chat_id uuid references public.chats(id) on delete set null,
  trigger_message_id uuid references public.messages(id) on delete set null, status text not null default 'running' check (status in ('running','completed','failed','skipped')),
  provider_request_id text, input_excerpt text, output_excerpt text, error text, started_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists automation_agent_runs_workspace_started_idx on public.automation_agent_runs(workspace_id, started_at desc);
create index if not exists automation_agent_runs_agent_started_idx on public.automation_agent_runs(agent_id, started_at desc);

create table if not exists public.workspace_billing (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade, provider text, external_customer_id text,
  external_subscription_id text, plan_key text, status text not null default 'unconfigured' check (status in ('unconfigured','trialing','active','past_due','canceled','paused')),
  current_period_end timestamptz, cancel_at_period_end boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$
begin
  if to_regprocedure('public.touch_updated_at()') is null then
    execute $fn$
      create function public.touch_updated_at() returns trigger
      language plpgsql as $body$
      begin new.updated_at = now(); return new; end
      $body$
    $fn$;
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['crm_stages','crm_leads','follow_up_tasks','automation_agents','workspace_billing'] loop
    execute format('drop trigger if exists touch_%I_updated_at on public.%I', t, t);
    execute format('create trigger touch_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['crm_stages','crm_leads','follow_up_tasks','automation_agents','automation_agent_runs','workspace_billing'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists service_role_backend_access on public.%I', t);
    execute format('create policy service_role_backend_access on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
