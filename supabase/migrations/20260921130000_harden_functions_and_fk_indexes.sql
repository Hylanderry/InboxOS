-- Close the remaining database advisor findings after the inbox reconciliation.

alter function public.touch_updated_at() set search_path = public;

revoke all on function public.emit_inbox_event() from public, anon, authenticated;
grant execute on function public.emit_inbox_event() to service_role;

drop index if exists public.idx_messages_workspace_client_msg_id;

create index if not exists chats_instance_id_idx
  on public.chats(instance_id);
create index if not exists contact_identity_aliases_contact_id_idx
  on public.contact_identity_aliases(contact_id);
create index if not exists contact_identity_aliases_instance_id_idx
  on public.contact_identity_aliases(instance_id);
create index if not exists evolution_events_instance_id_idx
  on public.evolution_events(instance_id);
create index if not exists group_participants_instance_id_idx
  on public.group_participants(instance_id);
create index if not exists group_participants_workspace_id_idx
  on public.group_participants(workspace_id);
create index if not exists messages_instance_id_idx
  on public.messages(instance_id);
create index if not exists outbound_messages_chat_id_idx
  on public.outbound_messages(chat_id);
create index if not exists outbound_messages_instance_id_idx
  on public.outbound_messages(instance_id);
create index if not exists whatsapp_contacts_instance_id_idx
  on public.whatsapp_contacts(instance_id);
create index if not exists whatsapp_presence_instance_id_idx
  on public.whatsapp_presence(instance_id);
