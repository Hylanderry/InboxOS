-- White-label legal documents and consent history.
-- Additive and idempotent: existing legal records remain intact.

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  slug text not null,
  version text not null,
  title text not null,
  body_markdown text not null,
  required boolean not null default false,
  active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table if exists public.legal_documents
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create unique index if not exists legal_documents_workspace_slug_version_key
  on public.legal_documents (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), slug, version);
create index if not exists legal_documents_workspace_active_idx
  on public.legal_documents (workspace_id, active, published_at desc);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.legal_acceptances
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create index if not exists legal_acceptances_workspace_user_idx
  on public.legal_acceptances (workspace_id, user_id, accepted_at desc);
create index if not exists legal_acceptances_document_idx
  on public.legal_acceptances (document_id, accepted_at desc);

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
revoke all on table public.legal_documents, public.legal_acceptances from anon, authenticated;
grant all on table public.legal_documents, public.legal_acceptances to service_role;

drop policy if exists service_role_legal_documents on public.legal_documents;
create policy service_role_legal_documents on public.legal_documents
  for all to service_role using (true) with check (true);
drop policy if exists service_role_legal_acceptances on public.legal_acceptances;
create policy service_role_legal_acceptances on public.legal_acceptances
  for all to service_role using (true) with check (true);

-- Seed only the platform fallback documents when a deployment has no legal catalog.
-- Workspace-specific documents can override these rows through the service role.
insert into public.legal_documents (slug, version, title, body_markdown, required)
select 'terms-of-use', '1.0.0', 'Termos de Uso', '# Termos de Uso\n\nConsulte os termos apresentados pela organização responsável por este workspace.', true
where not exists (select 1 from public.legal_documents where workspace_id is null and slug = 'terms-of-use' and active);
insert into public.legal_documents (slug, version, title, body_markdown, required)
select 'privacy-policy', '1.0.0', 'Política de Privacidade', '# Política de Privacidade\n\nConsulte a política apresentada pela organização responsável por este workspace.', true
where not exists (select 1 from public.legal_documents where workspace_id is null and slug = 'privacy-policy' and active);
