-- Runtime defaults and identity guarantees for the white-label control plane.
-- Additive/idempotent. No operational rows are deleted or rewritten.

-- Every existing workspace receives the privacy-by-default policy. New
-- workspaces can still be created with the same defaults from the table.
insert into public.workspace_privacy_settings (workspace_id)
select w.id
from public.workspaces w
on conflict (workspace_id) do nothing;

-- Keep the privacy-by-default row present for every future workspace too,
-- including workspaces provisioned by the isolated admin control plane.
create or replace function public.ensure_workspace_privacy_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_privacy_settings (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_workspace_privacy_defaults() from public, anon, authenticated;
grant execute on function public.ensure_workspace_privacy_defaults() to service_role;
drop trigger if exists ensure_workspace_privacy_defaults on public.workspaces;
create trigger ensure_workspace_privacy_defaults
  after insert on public.workspaces
  for each row execute function public.ensure_workspace_privacy_defaults();

-- A correction request is a controlled manual-review workflow, not a silent
-- rejection. The operator may review and complete it outside the automated
-- destructive worker.
alter table public.workspace_data_requests
  drop constraint if exists workspace_data_requests_status_check;
alter table public.workspace_data_requests
  add constraint workspace_data_requests_status_check
  check (status in ('pending', 'processing', 'manual_review', 'completed', 'rejected', 'failed'));

-- Evolution sends only its technical instance name in the public webhook.
-- Keep that identity globally unique until a provider-account mapping exists.
-- If an installation already contains duplicate names, fail explicitly so an
-- operator can resolve the ambiguity instead of silently routing an event to
-- the wrong tenant.
do $$
begin
  if exists (
    select 1
    from public.whatsapp_instances
    group by instance_name
    having count(*) > 1
  ) then
    raise exception 'duplicate Evolution instance_name values must be resolved before enabling global identity uniqueness';
  end if;
end $$;

create unique index if not exists whatsapp_instances_evolution_name_unique
  on public.whatsapp_instances(instance_name);
