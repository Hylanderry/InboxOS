-- 05 — CORREÇÃO do "Limitador indisponível". Altera o banco: rodar somente com autorização do dono.
-- Só ACRESCENTA as duas colunas que a função consume_auth_rate_limit exige. Não apaga nem
-- renomeia nada (first_attempt_at continua existindo). Rodar o arquivo INTEIRO de uma vez:
-- é uma transação e, se o teste no final falhar, nada é aplicado.

begin;

set local lock_timeout = '5s';

alter table public.auth_rate_limits
  add column if not exists window_started_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Janelas antigas mantêm o horário original (expiram naturalmente).
update public.auth_rate_limits
set window_started_at = coalesce(window_started_at, first_attempt_at, now()),
    updated_at = coalesce(updated_at, first_attempt_at, now())
where window_started_at is null or updated_at is null;

alter table public.auth_rate_limits
  alter column window_started_at set default now(),
  alter column window_started_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- Teste real da função: 1ª chamada permitida, 2ª bloqueada com limite 1. A linha de teste é removida.
do $$
declare
  r record;
begin
  select * into r from public.consume_auth_rate_limit('diagnostico-05', 'teste', 1, 60, 60);
  if r.allowed is not true then
    raise exception 'teste falhou: primeira chamada deveria ser permitida';
  end if;
  select * into r from public.consume_auth_rate_limit('diagnostico-05', 'teste', 1, 60, 60);
  if r.allowed is not false then
    raise exception 'teste falhou: segunda chamada deveria ser bloqueada';
  end if;
  delete from public.auth_rate_limits where action = 'diagnostico-05' and scope_hash = 'teste';
end $$;

commit;

select 'correcao aplicada' as resultado;
