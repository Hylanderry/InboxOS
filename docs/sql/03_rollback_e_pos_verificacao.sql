-- 03 — ROLLBACK e PÓS-VERIFICAÇÃO da contenção.

-- A) ROLLBACK (restaura exatamente os membros removidos; só usar se a contenção removeu alguém indevido)
-- insert into public.workspace_members
-- select * from private.wm_backup_20261125
-- where workspace_id = '00000000-0000-0000-0000-000000000001'
-- on conflict do nothing;
-- (Obs.: o trigger de auto-membership NÃO deve ser recriado; restaure só membros legítimos.)

-- B) PÓS-VERIFICAÇÃO (read-only)
select role, count(*) from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001' group by role;

select count(*) as trigger_ainda_existe
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'users' and t.tgname = 'bootstrap_first_workspace_owner' and not t.tgisinternal;

-- Quantos usuários ainda pertencem ao padrão E a outro workspace (esperado: apenas o dono legítimo, se houver)
select count(*) as usuarios_no_padrao_e_em_outro
from public.workspace_members wm
where wm.workspace_id = '00000000-0000-0000-0000-000000000001'
  and exists (select 1 from public.workspace_members o
              where o.user_id = wm.user_id and o.workspace_id <> wm.workspace_id);

-- C) REVOGAR SESSÕES dos usuários removidos (tokens já emitidos continuam válidos até expirar).
-- Rodar só para os UUIDs removidos (obtidos comparando com private.wm_backup_20261125):
-- delete from auth.sessions where user_id in (<UUIDs removidos>);

-- D) Teste manual final: criar uma conta nova, entrar e confirmar que a lista de instâncias está vazia
--    e que não existe linha dela em workspace_members do workspace padrão.
