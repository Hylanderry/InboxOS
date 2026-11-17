-- Calendar, clients/tags and agent context primitives.
-- All application access goes through authenticated server handlers using service_role.

create table if not exists public.calendar_calendars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  timezone text not null default 'America/Sao_Paulo',
  slot_duration_minutes integer not null default 30 check (slot_duration_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  daily_capacity integer not null default 20 check (daily_capacity between 1 and 500),
  availability jsonb not null default '{"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]]}'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  calendar_id uuid not null references public.calendar_calendars(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  chat_id uuid references public.chats(id) on delete set null,
  agent_id uuid references public.automation_agents(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','canceled','no_show')),
  source text not null default 'manual' check (source in ('manual','agent','follow_up','import')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_appointments_valid_window check (ends_at > starts_at)
);

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#71717a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.crm_lead_tags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, lead_id, tag_id)
);

create index if not exists calendar_calendars_workspace_active_idx
  on public.calendar_calendars(workspace_id, active, is_default);
create index if not exists calendar_appointments_workspace_start_idx
  on public.calendar_appointments(workspace_id, starts_at, status);
create index if not exists calendar_appointments_calendar_start_idx
  on public.calendar_appointments(calendar_id, starts_at, status);
create index if not exists calendar_appointments_lead_idx
  on public.calendar_appointments(workspace_id, lead_id, starts_at);
create index if not exists crm_tags_workspace_name_idx
  on public.crm_tags(workspace_id, name);
create index if not exists crm_lead_tags_workspace_tag_idx
  on public.crm_lead_tags(workspace_id, tag_id, lead_id);

alter table public.calendar_calendars enable row level security;
alter table public.calendar_appointments enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_lead_tags enable row level security;

revoke all on public.calendar_calendars from anon, authenticated;
revoke all on public.calendar_appointments from anon, authenticated;
revoke all on public.crm_tags from anon, authenticated;
revoke all on public.crm_lead_tags from anon, authenticated;
grant all on public.calendar_calendars to service_role;
grant all on public.calendar_appointments to service_role;
grant all on public.crm_tags to service_role;
grant all on public.crm_lead_tags to service_role;

drop trigger if exists calendar_calendars_updated_at on public.calendar_calendars;
create trigger calendar_calendars_updated_at before update on public.calendar_calendars
for each row execute function public.update_updated_at_column();
drop trigger if exists calendar_appointments_updated_at on public.calendar_appointments;
create trigger calendar_appointments_updated_at before update on public.calendar_appointments
for each row execute function public.update_updated_at_column();
drop trigger if exists crm_tags_updated_at on public.crm_tags;
create trigger crm_tags_updated_at before update on public.crm_tags
for each row execute function public.update_updated_at_column();

-- The API validates conflicts before writing. This trigger closes the race
-- window when two agents try to reserve the same calendar simultaneously.
create or replace function public.prevent_calendar_appointment_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  buffer_minutes integer := 0;
begin
  if new.status in ('scheduled', 'confirmed') then
    perform pg_advisory_xact_lock(hashtext(new.calendar_id::text));
    select coalesce(c.buffer_minutes, 0)
      into buffer_minutes
      from public.calendar_calendars c
      where c.id = new.calendar_id
        and c.workspace_id = new.workspace_id;
    if exists (
      select 1
      from public.calendar_appointments current_booking
      where current_booking.workspace_id = new.workspace_id
        and current_booking.calendar_id = new.calendar_id
        and current_booking.id <> new.id
        and current_booking.status in ('scheduled', 'confirmed')
        and tstzrange(
              current_booking.starts_at - make_interval(mins => buffer_minutes),
              current_booking.ends_at + make_interval(mins => buffer_minutes),
              '[)'
            )
            && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception using message = 'calendar_appointment_overlap';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_appointments_overlap_guard on public.calendar_appointments;
create trigger calendar_appointments_overlap_guard
before insert or update of calendar_id, starts_at, ends_at, status on public.calendar_appointments
for each row execute function public.prevent_calendar_appointment_overlap();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_appointments'
  ) then
    alter publication supabase_realtime add table public.calendar_appointments;
  end if;
end;
$$;
