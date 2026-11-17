-- Repository reconciliation only. Apply to isolated staging first.
alter table public.whatsapp_instances
  add column if not exists connected_at timestamptz;

alter table public.automation_agents
  add column if not exists runtime_config jsonb not null default '{}'::jsonb;

-- PostgreSQL requires an exact UNIQUE/PK target for every composite FK below.
-- The primary keys are already unique, but these scoped indexes make the
-- workspace/instance relationship explicit and allow the FK definitions to
-- validate on projects that do not yet have equivalent covering indexes.
create unique index if not exists whatsapp_instances_workspace_id_id_uidx
  on public.whatsapp_instances(workspace_id, id);

create unique index if not exists chats_workspace_instance_id_uidx
  on public.chats(workspace_id, instance_id, id);

create table if not exists public.handover_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  chat_id uuid not null,
  instance_id uuid not null,
  trigger_message_id uuid not null,
  status text not null default 'queued' check (status in ('queued','assigned','in_progress','resolved','canceled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  reason text not null default 'human_requested',
  assigned_to uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, trigger_message_id),
  foreign key (workspace_id, instance_id) references public.whatsapp_instances(workspace_id, id) on delete cascade,
  foreign key (workspace_id, instance_id, chat_id) references public.chats(workspace_id, instance_id, id) on delete cascade,
  foreign key (workspace_id, trigger_message_id) references public.messages(workspace_id, id) on delete cascade
);

create index if not exists handover_requests_workspace_status_requested_idx
  on public.handover_requests(workspace_id, status, requested_at desc);

alter table public.handover_requests enable row level security;
revoke all on table public.handover_requests from anon, authenticated;
grant all on table public.handover_requests to service_role;
drop policy if exists service_role_backend_access on public.handover_requests;
create policy service_role_backend_access on public.handover_requests
  for all to service_role using (true) with check (true);
