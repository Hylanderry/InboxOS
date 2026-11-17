-- Emit workspace-scoped panel events for calendar and CRM changes.
-- The existing inbox event cursor is the single browser transport, so these
-- triggers keep Calendar/Clients in sync without exposing service-role tables
-- to an anonymous Supabase channel.

do $$
begin
  if to_regprocedure('public.emit_inbox_event()') is null then
    raise exception 'public.emit_inbox_event() is required before calendar realtime events';
  end if;
end;
$$;

drop trigger if exists emit_calendar_calendars_event on public.calendar_calendars;
create trigger emit_calendar_calendars_event
after insert or update or delete on public.calendar_calendars
for each row execute function public.emit_inbox_event();

drop trigger if exists emit_calendar_appointments_event on public.calendar_appointments;
create trigger emit_calendar_appointments_event
after insert or update or delete on public.calendar_appointments
for each row execute function public.emit_inbox_event();

drop trigger if exists emit_crm_leads_event on public.crm_leads;
create trigger emit_crm_leads_event
after insert or update or delete on public.crm_leads
for each row execute function public.emit_inbox_event();

drop trigger if exists emit_crm_lead_tags_event on public.crm_lead_tags;
create trigger emit_crm_lead_tags_event
after insert or update or delete on public.crm_lead_tags
for each row execute function public.emit_inbox_event();

drop trigger if exists emit_crm_tags_event on public.crm_tags;
create trigger emit_crm_tags_event
after insert or update or delete on public.crm_tags
for each row execute function public.emit_inbox_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_calendars'
  ) then
    alter publication supabase_realtime add table public.calendar_calendars;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_leads'
  ) then
    alter publication supabase_realtime add table public.crm_leads;
  end if;
  if not exists (
    select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_lead_tags'
  ) then
    alter publication supabase_realtime add table public.crm_lead_tags;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_tags'
  ) then
    alter publication supabase_realtime add table public.crm_tags;
  end if;
end;
$$;
