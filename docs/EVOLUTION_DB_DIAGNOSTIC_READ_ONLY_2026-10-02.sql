-- InboxOS/Evolution: diagnostic ONLY. Safe SELECT queries; no changes to live data.
-- Run in the correct Supabase project and save results with timestamps.
select now() as checked_at, status, count(*) as events
from public.evolution_events group by status order by status;

select event_type, status, count(*) as events
from public.evolution_events
where status in ('queued','failed','processing','dead_letter')
group by event_type,status order by events desc limit 35;

select event_type, left(last_error,200) as failure_signature, count(*) as events
from public.evolution_events
where status='dead_letter' and last_error is not null
group by event_type, left(last_error,200)
order by events desc limit 20;

select conrelid::regclass::text as table_name, conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace='public'::regnamespace
  and contype in ('p','u')
  and conrelid::regclass::text in (
    'whatsapp_contacts','whatsapp_presence','chats',
    'group_participants','contact_identity_aliases','evolution_events')
order by table_name,conname;

-- The following should always be zero on a healthy staging environment.
select count(*) as duplicate_instance_names from
(select instance_name from public.whatsapp_instances group by instance_name having count(*)>1) names;
