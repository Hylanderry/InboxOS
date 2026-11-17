-- Idempotent follow-up already present in the live migration history.
create index if not exists system_admins_created_by_idx on public.system_admins(created_by) where created_by is not null;
create index if not exists system_user_controls_updated_by_idx on public.system_user_controls(updated_by) where updated_by is not null;
