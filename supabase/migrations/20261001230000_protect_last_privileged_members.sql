-- Transaction-safe invariants for concurrent administrative mutations.
-- Apply to STAGING only after reconciling the local/remote migration history.
-- Lock is taken before counting active peers, preventing two concurrent
-- downgrades/suspensions from independently observing the other as active.
create schema if not exists private;

create or replace function private.guard_last_active_workspace_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.role <> 'owner' or old.status <> 'active' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'DELETE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inboxos:workspace-owner:' || old.workspace_id::text, 0)
  );
  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = old.workspace_id
      and m.user_id <> old.user_id
      and m.role = 'owner'
      and m.status = 'active'
  ) then
    raise exception 'Não é permitido remover o último owner ativo' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_last_active_workspace_owner on public.workspace_members;
create trigger trg_guard_last_active_workspace_owner
before update of role, status or delete on public.workspace_members
for each row execute function private.guard_last_active_workspace_owner();

create or replace function private.guard_last_active_system_superadmin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.role <> 'superadmin' or old.status <> 'active' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'DELETE' and new.role = 'superadmin' and new.status = 'active' then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inboxos:system-superadmin', 0)
  );
  if not exists (
    select 1 from public.system_admins s
      left join public.system_user_controls c on c.user_id = s.user_id
    where s.user_id <> old.user_id and s.role = 'superadmin'
      and s.status = 'active' and coalesce(c.status, 'active') <> 'suspended'
  ) then
    raise exception 'Não é permitido remover o último superadmin ativo' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_last_active_system_superadmin on public.system_admins;
create trigger trg_guard_last_active_system_superadmin
before update of role, status or delete on public.system_admins
for each row execute function private.guard_last_active_system_superadmin();

create or replace function private.guard_last_superadmin_global_suspension()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> 'suspended' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'suspended' then return new; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('inboxos:system-superadmin', 0)
  );
  if exists (
    select 1 from public.system_admins s
    where s.user_id = new.user_id and s.role = 'superadmin' and s.status = 'active'
  ) and not exists (
    select 1 from public.system_admins s
      left join public.system_user_controls c on c.user_id = s.user_id
    where s.user_id <> new.user_id and s.role = 'superadmin'
      and s.status = 'active' and coalesce(c.status, 'active') <> 'suspended'
  ) then
    raise exception 'Não é permitido suspender o último superadmin ativo' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_last_superadmin_global_suspension on public.system_user_controls;
create trigger trg_guard_last_superadmin_global_suspension
before insert or update of status on public.system_user_controls
for each row execute function private.guard_last_superadmin_global_suspension();
