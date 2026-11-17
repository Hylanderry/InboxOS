-- Remove legacy anonymous table privileges that were reintroduced by an
-- earlier realtime migration. Authenticated access remains RLS-scoped; all
-- server-side Evolution writes continue through service_role.
revoke all on public.whatsapp_instances from anon;
revoke all on public.chats from anon;
revoke all on public.messages from anon;
revoke all on public.whatsapp_contacts from anon;
revoke all on public.whatsapp_presence from anon;
revoke all on public.contact_identity_aliases from anon;
revoke all on public.group_participants from anon;
revoke all on public.evolution_events from anon;
revoke all on public.outbound_messages from anon;
revoke all on public.inbox_events from anon;

-- Private media must never be readable by an anonymous browser. Newsletter
-- media intentionally keeps its separate public-read policy.
revoke all on storage.objects from anon;
drop policy if exists chat_media_anon_read on storage.objects;
drop policy if exists profile_media_anon_read on storage.objects;
drop policy if exists privacy_exports_anon_read on storage.objects;
