-- Integrity guards for tenant privacy requests and custom domains.
-- Additive and fail-closed: existing ambiguous rows must be resolved by an
-- operator before the unique indexes are enabled; this migration never picks
-- a winner or deletes user data automatically.

do $$
begin
  if exists (
    select 1
    from public.workspace_data_requests
    where status in ('pending', 'processing', 'manual_review')
    group by workspace_id, request_type
    having count(*) > 1
  ) then
    raise exception 'duplicate active privacy requests must be resolved before enabling idempotency guard';
  end if;

  if exists (
    select 1
    from public.workspace_company_profiles
    where custom_domain is not null and btrim(custom_domain) <> ''
    group by lower(custom_domain)
    having count(*) > 1
  ) then
    raise exception 'duplicate custom domains must be resolved before enabling white-label domain guard';
  end if;
end $$;

create unique index if not exists workspace_data_requests_active_type_uidx
  on public.workspace_data_requests(workspace_id, request_type)
  where status in ('pending', 'processing', 'manual_review');

create unique index if not exists workspace_company_profiles_custom_domain_uidx
  on public.workspace_company_profiles(lower(custom_domain))
  where custom_domain is not null and btrim(custom_domain) <> '';
