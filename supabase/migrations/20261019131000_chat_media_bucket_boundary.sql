-- Ensure a fresh white-label installation has the private chat-media bucket.
-- Existing installations keep their MIME policy, but the bucket can never be
-- made public by a stale or manually-created configuration.

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 52428800)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        lower(policyname) like '%chat_media%'
        or lower(policyname) like '%chat media%'
        or coalesce(qual, '') ilike '%chat-media%'
        or coalesce(with_check, '') ilike '%chat-media%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end $$;

create policy chat_media_service_read
  on storage.objects for select to service_role
  using (bucket_id = 'chat-media');

create policy chat_media_service_insert
  on storage.objects for insert to service_role
  with check (bucket_id = 'chat-media');

create policy chat_media_service_update
  on storage.objects for update to service_role
  using (bucket_id = 'chat-media')
  with check (bucket_id = 'chat-media');

create policy chat_media_service_delete
  on storage.objects for delete to service_role
  using (bucket_id = 'chat-media');
