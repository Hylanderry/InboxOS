-- 01 — DIAGNÓSTICO READ-ONLY (produção). Só SELECT: sem telefones, e-mails ou mensagens.
-- Rodar no SQL Editor do Supabase e enviar apenas os números/saídas.

-- 1.1 Migrations de interesse aplicadas?
select version, name from supabase_migrations.schema_migrations
where version in ('20260915120000','20261017090000','20261018092000')
order by version;

-- 1.2 Membros do workspace padrão, por papel
select role, status, count(*) as membros
from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001'
group by role, status order by role, status;

-- 1.3 Membros do padrão que também têm workspace próprio (suspeitos de herança indevida)
select count(*) as suspeitos
from public.workspace_members wm
where wm.workspace_id = '00000000-0000-0000-0000-000000000001'
  and exists (select 1 from public.workspace_members o
              where o.user_id = wm.user_id and o.workspace_id <> wm.workspace_id);

-- 1.4 Instâncias e chats dentro do workspace padrão (só contagem)
select
  (select count(*) from public.whatsapp_instances
    where workspace_id = '00000000-0000-0000-0000-000000000001') as instancias_no_padrao,
  (select count(*) from public.chats
    where workspace_id = '00000000-0000-0000-0000-000000000001') as chats_no_padrao;

-- 1.5 Trigger de auto-membership ainda existe? Corpo da função?
select t.tgname, t.tgenabled
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'users' and t.tgname = 'bootstrap_first_workspace_owner' and not t.tgisinternal;

select p.prosrc as corpo_da_funcao
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'bootstrap_first_workspace_owner';

-- 1.6 Contas criadas depois do reparo que ainda caíram no padrão
-- (created_at do membership vs. data da migration de reparo)
select count(*) as entradas_apos_reparo
from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001'
  and created_at >= '2026-10-17'::timestamptz
  and role <> 'owner';

-- 1.7 Quem são os owners do padrão (só IDs, para você reconhecer o seu)
select user_id, role from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001' and role in ('owner','admin');
