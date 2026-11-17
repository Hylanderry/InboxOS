-- Keeps WhatsApp agenda state available for CRM classification.
-- This migration is additive and safe to replay.
alter table public.whatsapp_contacts
  add column if not exists is_saved boolean not null default false;

create index if not exists whatsapp_contacts_workspace_saved_idx
  on public.whatsapp_contacts(workspace_id, is_saved);

-- A WhatsApp identity can map to at most one CRM record in a workspace.
-- Existing data was checked before creating these indexes; the predicates keep
-- contacts without a relation valid for manual leads.
create unique index if not exists crm_leads_workspace_contact_unique
  on public.crm_leads(workspace_id, contact_id)
  where contact_id is not null;

create unique index if not exists crm_leads_workspace_chat_unique
  on public.crm_leads(workspace_id, chat_id)
  where chat_id is not null;
