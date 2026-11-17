-- Evolution runtime repair for environments that received the application
-- migrations without the instance-scoped unique keys/check constraint.
-- Additive/idempotent: no messages, contacts or events are deleted.

alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_connection_state_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_connection_state_check
  check (
    connection_state is null
    or connection_state in (
      'open', 'connecting', 'connected', 'disconnected', 'close', 'qrcode'
    )
  );

create unique index if not exists whatsapp_instances_workspace_instance_key
  on public.whatsapp_instances(workspace_id, instance_name);

create unique index if not exists whatsapp_contacts_workspace_instance_remote_jid_key
  on public.whatsapp_contacts(workspace_id, instance_id, remote_jid);

create unique index if not exists whatsapp_presence_workspace_instance_phone_key
  on public.whatsapp_presence(workspace_id, instance_id, phone);

create unique index if not exists evolution_events_workspace_id_event_key_key
  on public.evolution_events(workspace_id, event_key);
