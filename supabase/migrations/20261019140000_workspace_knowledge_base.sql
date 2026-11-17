-- Workspace-scoped knowledge documents for explicitly authorized AI context.
-- Additive and idempotent: no existing operational data is changed.

create table if not exists public.workspace_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  content text not null check (char_length(trim(content)) between 1 and 20000),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_knowledge_documents_workspace_active_idx
  on public.workspace_knowledge_documents(workspace_id, active, updated_at desc);

alter table public.workspace_knowledge_documents enable row level security;
revoke all on table public.workspace_knowledge_documents from anon, authenticated;
grant all on table public.workspace_knowledge_documents to service_role;
drop policy if exists workspace_knowledge_documents_service_role on public.workspace_knowledge_documents;
create policy workspace_knowledge_documents_service_role
  on public.workspace_knowledge_documents
  for all to service_role using (true) with check (true);

create or replace function public.touch_workspace_knowledge_documents_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_knowledge_documents_touch on public.workspace_knowledge_documents;
create trigger workspace_knowledge_documents_touch
before update on public.workspace_knowledge_documents
for each row execute function public.touch_workspace_knowledge_documents_updated_at();
