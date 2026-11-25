-- S0/I1 — Blindagem do workspace padrão legado.
--
-- Contexto: a migration 20260915120000 concedeu a TODA conta nova membership no workspace
-- padrão (00000000-...-0001), expondo a instância do dono a desconhecidos. Esta migration
-- impede que isso se repita no nível do banco, independente do código da aplicação.
--
-- NÃO substitui a contenção dos dados existentes (docs/sql/02_contencao_producao.sql).
-- Aplicar primeiro em staging e só depois em produção, com autorização e rollback.

create schema if not exists private;

-- 1) Allowlist explícita de quem pode pertencer ao workspace padrão.
create table if not exists private.legacy_workspace_owners (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
alter table private.legacy_workspace_owners enable row level security;
revoke all on private.legacy_workspace_owners from public, anon, authenticated;

-- Semente: apenas o(s) owner(s) atual(is) do workspace padrão. Revise esta lista na contenção.
insert into private.legacy_workspace_owners (user_id)
select user_id
from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
  and role = 'owner'
on conflict (user_id) do nothing;

-- 2) Guarda: nenhum INSERT/UPDATE pode colocar usuário fora da allowlist no workspace padrão.
create or replace function private.guard_default_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id = '00000000-0000-0000-0000-000000000001'::uuid
     and not exists (
       select 1 from private.legacy_workspace_owners o where o.user_id = new.user_id
     ) then
    raise exception 'Workspace padrão legado é restrito: usuário % não autorizado', new.user_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_default_workspace_membership() from public, anon, authenticated;

drop trigger if exists guard_default_workspace_membership on public.workspace_members;
create trigger guard_default_workspace_membership
  before insert or update of workspace_id, user_id on public.workspace_members
  for each row execute function private.guard_default_workspace_membership();

-- 3) Remove definitivamente o auto-membership de novos cadastros.
drop trigger if exists bootstrap_first_workspace_owner on auth.users;

create or replace function private.bootstrap_first_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return new;
end;
$$;

revoke all on function private.bootstrap_first_workspace_owner() from public, anon, authenticated;
