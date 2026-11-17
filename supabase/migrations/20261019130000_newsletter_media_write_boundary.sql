-- Keep newsletter media publicly readable for published e-mails, but never
-- publicly writable. This repairs installations that may have received a
-- broad storage.objects policy before the newsletter upload boundary existed.

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
        lower(policyname) like '%newsletter%'
        or coalesce(qual, '') ilike '%newsletter-media%'
        or coalesce(with_check, '') ilike '%newsletter-media%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end $$;

-- The bucket's `public` flag controls anonymous reads. These policies are
-- deliberately scoped to service_role and do not grant browser write access.
drop policy if exists newsletter_media_service_insert on storage.objects;
drop policy if exists newsletter_media_service_update on storage.objects;
drop policy if exists newsletter_media_service_delete on storage.objects;

create policy newsletter_media_service_insert
  on storage.objects for insert to service_role
  with check (bucket_id = 'newsletter-media');

create policy newsletter_media_service_update
  on storage.objects for update to service_role
  using (bucket_id = 'newsletter-media')
  with check (bucket_id = 'newsletter-media');

create policy newsletter_media_service_delete
  on storage.objects for delete to service_role
  using (bucket_id = 'newsletter-media');

