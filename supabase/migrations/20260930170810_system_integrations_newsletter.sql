-- Integrations managed by System Admin only; no direct browser/anon/authenticated grants.
create table if not exists public.system_integrations (
  id uuid primary key default gen_random_uuid(),key text not null unique check(key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  name text not null check(char_length(name) between 2 and 120),provider text not null check(provider in ('evolution','groq','resend','custom')),
  base_url text,enabled boolean not null default true,config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,last_test_status text check(last_test_status is null or last_test_status in ('ok','error')),last_test_error text,
  updated_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.system_integration_secrets (
  id uuid primary key default gen_random_uuid(),integration_id uuid not null references public.system_integrations(id) on delete cascade,
  secret_key text not null check(secret_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),ciphertext text not null,iv text not null,auth_tag text not null,
  masked_hint text,version integer not null default 1 check(version>0),rotated_by uuid references auth.users(id) on delete set null,
  rotated_at timestamptz not null default now(),unique(integration_id,secret_key)
);
create index if not exists system_integrations_provider_enabled_idx on public.system_integrations(provider,enabled);
create index if not exists system_integrations_updated_by_idx on public.system_integrations(updated_by) where updated_by is not null;
create index if not exists system_integration_secrets_integration_idx on public.system_integration_secrets(integration_id);
create index if not exists system_integration_secrets_rotated_by_idx on public.system_integration_secrets(rotated_by) where rotated_by is not null;
drop trigger if exists touch_system_integrations_updated_at on public.system_integrations;
create trigger touch_system_integrations_updated_at before update on public.system_integrations for each row execute function public.touch_updated_at();
create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 2 and 120),
  subject text not null check(char_length(subject) between 1 and 200),preview_text text,from_name text,from_email text,reply_to text,segment_id text,
  status text not null default 'draft' check(status in ('draft','scheduled','queued','sent','canceled','failed')),
  content jsonb not null default '[]'::jsonb,resend_broadcast_id text,scheduled_at timestamptz,sent_at timestamptz,last_error text,
  created_by uuid references auth.users(id) on delete set null,updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.newsletter_media_assets (
  id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('image','video')),
  storage_path text not null unique,public_url text not null,mime_type text not null,file_name text not null,
  size_bytes bigint not null check(size_bytes>=0),created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index if not exists newsletter_campaigns_status_updated_idx on public.newsletter_campaigns(status,updated_at desc);
create index if not exists newsletter_campaigns_created_by_idx on public.newsletter_campaigns(created_by) where created_by is not null;
create index if not exists newsletter_campaigns_updated_by_idx on public.newsletter_campaigns(updated_by) where updated_by is not null;
create index if not exists newsletter_media_created_idx on public.newsletter_media_assets(created_at desc);
create index if not exists newsletter_media_created_by_idx on public.newsletter_media_assets(created_by) where created_by is not null;
drop trigger if exists touch_newsletter_campaigns_updated_at on public.newsletter_campaigns;
create trigger touch_newsletter_campaigns_updated_at before update on public.newsletter_campaigns for each row execute function public.touch_updated_at();
do $$ declare t text; begin
  foreach t in array array['system_integrations','system_integration_secrets','newsletter_campaigns','newsletter_media_assets'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
    execute format('drop policy if exists service_role_backend_access on public.%I',t);
    execute format('create policy service_role_backend_access on public.%I for all to service_role using(true) with check(true)',t);
  end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values (
  'newsletter-media','newsletter-media',true,52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[]
) on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into public.system_integrations(key,name,provider,base_url,enabled,config) values
  ('evolution','Evolution API','evolution',null,true,'{}'::jsonb),
  ('groq','Groq AI','groq','https://api.groq.com/openai/v1',true,'{"model":"llama-3.3-70b-versatile"}'::jsonb),
  ('resend','Resend','resend','https://api.resend.com',true,'{}'::jsonb)
on conflict(key) do nothing;
