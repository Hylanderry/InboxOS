-- AI providers are controlled exclusively by System Admin through system_integrations.
-- Workspace users receive only the enabled provider/model allowlist from the server.
-- Additive and idempotent: no existing agent, message, contact or integration is removed.

alter table public.system_integrations
  drop constraint if exists system_integrations_provider_check;

alter table public.system_integrations
  add constraint system_integrations_provider_check
  check (provider in ('evolution', 'groq', 'openrouter', 'resend', 'custom'));

alter table public.automation_agents
  drop constraint if exists automation_agents_provider_check;

alter table public.automation_agents
  add constraint automation_agents_provider_check
  check (provider in ('groq', 'openrouter'));

insert into public.system_integrations (key, name, provider, base_url, enabled, config)
values (
  'openrouter',
  'OpenRouter AI',
  'openrouter',
  'https://openrouter.ai/api/v1',
  false,
  '{"allowed_models":[]}'::jsonb
)
on conflict (key) do nothing;

-- The integration tables are already RLS-enabled and service_role-only. Keep that boundary explicit
-- for installations that imported only a subset of historical migrations.
alter table public.system_integrations enable row level security;
revoke all on table public.system_integrations from anon, authenticated;
grant all on table public.system_integrations to service_role;
