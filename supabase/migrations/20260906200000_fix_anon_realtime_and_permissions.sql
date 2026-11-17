-- Esta migração concedia leitura irrestrita ao papel anon e expunha todo o inbox.
-- Ela foi substituída pela recuperação de segurança de 2026-09-12, que exige
-- usuário autenticado e associação ao workspace. O arquivo permanece como no-op
-- para preservar a ordem/histórico das migrações sem reabrir o acesso anônimo em
-- um futuro `supabase db push` executado em um banco novo.

DO $$
BEGIN
  RAISE NOTICE 'Migração obsoleta: acesso anônimo permanece desabilitado.';
END $$;
