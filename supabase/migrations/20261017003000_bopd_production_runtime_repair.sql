-- InboxOS runtime repair for the configured production database.
-- Additive and idempotent. No messages, contacts or events are deleted.
-- Apply this migration in the Supabase project used by production.

alter table public.whatsapp_contacts
  add column if not exists is_saved boolean not null default false;

create index if not exists whatsapp_contacts_workspace_saved_idx
  on public.whatsapp_contacts(workspace_id, is_saved);

-- These are the conflict targets used by the Evolution webhook and worker.
-- CREATE UNIQUE INDEX intentionally fails instead of deleting duplicate data
-- if an old database contains conflicting rows; resolve those rows manually.
create unique index if not exists whatsapp_instances_workspace_instance_key
  on public.whatsapp_instances(workspace_id, instance_name);

create unique index if not exists whatsapp_contacts_workspace_instance_remote_jid_key
  on public.whatsapp_contacts(workspace_id, instance_id, remote_jid);

create unique index if not exists whatsapp_presence_workspace_instance_phone_key
  on public.whatsapp_presence(workspace_id, instance_id, phone);

create unique index if not exists evolution_events_workspace_id_event_key_key
  on public.evolution_events(workspace_id, event_key);
