-- 06 — ROLLBACK do arquivo 05. Remove somente as duas colunas acrescentadas.
-- Atenção: volta ao estado em que o limitador falha (erro 42703).
begin;
set local lock_timeout = '5s';
alter table public.auth_rate_limits
  drop column if exists window_started_at,
  drop column if exists updated_at;
commit;
