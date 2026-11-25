-- 02 — CONTENÇÃO EM PRODUÇÃO. NÃO RODAR sem autorização explícita do dono e sem ter
-- enviado/analisado a saída de 01_diagnostico_readonly.sql.
--
-- ANTES: troque os UUIDs em v_keep (linha marcada) pelos usuários LEGÍTIMOS do workspace padrão
-- (o seu e, se houver, equipe aprovada). A lista vazia ABORTA a execução por segurança.
-- Roda numa transação única: qualquer falha desfaz tudo.

begin;

-- 0. Backup completo (rollback no arquivo 03)
create table if not exists private.wm_backup_20261125 as
  select * from public.workspace_members;
-- O schema private tem USAGE para authenticated: travar o backup (contém user_id de todos os tenants)
alter table private.wm_backup_20261125 enable row level security;
revoke all on private.wm_backup_20261125 from public, anon, authenticated;

do $$
declare
  v_default constant uuid := '00000000-0000-0000-0000-000000000001';
  v_keep uuid[] := array[
    -- >>> SUBSTITUIR: 'UUID-DO-DONO'::uuid, 'UUID-EQUIPE-APROVADA'::uuid
  ]::uuid[];
  v_before int;
  v_removed int;
begin
  if coalesce(array_length(v_keep, 1), 0) = 0 then
    raise exception 'Lista v_keep vazia: informe os usuários legítimos antes de executar';
  end if;
  if not exists (select 1 from auth.users where id = any (v_keep)) then
    raise exception 'Nenhum UUID de v_keep existe em auth.users: conferir os valores';
  end if;
  if not exists (select 1 from public.workspace_members
                 where workspace_id = v_default and user_id = any (v_keep) and role = 'owner') then
    raise exception 'Nenhum UUID de v_keep é owner do workspace padrão: abortando';
  end if;

  select count(*) into v_before from public.workspace_members where workspace_id = v_default;

  -- 1. Impedir novas heranças: função neutra + remover o trigger de auto-membership
  create or replace function private.bootstrap_first_workspace_owner()
  returns trigger language plpgsql security definer set search_path = public, auth
  as $fn$ begin return new; end; $fn$;
  revoke all on function private.bootstrap_first_workspace_owner() from public;
  drop trigger if exists bootstrap_first_workspace_owner on auth.users;

  -- 2. Remover quem não está na lista (qualquer papel, não só 'agent')
  delete from public.workspace_members
  where workspace_id = v_default and not (user_id = any (v_keep));
  get diagnostics v_removed = row_count;

  raise notice 'Membros do padrão antes: %, removidos: %', v_before, v_removed;
end $$;

-- 3. Verificação dentro da transação (confira antes do COMMIT)
select role, count(*) from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001' group by role;

select count(*) as trigger_ainda_existe
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'users' and t.tgname = 'bootstrap_first_workspace_owner' and not t.tgisinternal;

-- Se os números estiverem corretos: COMMIT;  Se algo estiver estranho: ROLLBACK;
-- (deixe a linha abaixo comentada até conferir as duas consultas acima)
-- commit;
