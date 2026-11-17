-- Keep Evolution's technical instance_name immutable and add a safe user-facing label.
-- Apply in isolated staging before production. Idempotent by design.
alter table public.whatsapp_instances
  add column if not exists display_name text;

alter table public.whatsapp_instances
  drop constraint if exists whatsapp_instances_display_name_length_check;

alter table public.whatsapp_instances
  add constraint whatsapp_instances_display_name_length_check
  check (display_name is null or (char_length(btrim(display_name)) between 1 and 80));

create index if not exists whatsapp_instances_workspace_display_name_idx
  on public.whatsapp_instances(workspace_id, display_name);
