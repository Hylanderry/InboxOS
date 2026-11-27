-- 04 — DIAGNÓSTICO READ-ONLY do erro "Limitador indisponível" (SQLSTATE 42703:
-- column "window_started_at" of relation "auth_rate_limits" does not exist).
-- Só SELECT de catálogo: nenhuma linha de dados é lida.

-- 1) Colunas que a tabela realmente tem
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'auth_rate_limits'
order by ordinal_position;

-- 2) Chave primária / unicidade (a função usa ON CONFLICT (action, scope_hash))
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.auth_rate_limits'::regclass;

-- 3) Definição da função em uso
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'consume_auth_rate_limit';
