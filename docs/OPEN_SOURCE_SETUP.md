# Setup do template open source

Este diretório é um modelo público e não contém credenciais, dados do cliente ou um dump de produção.

## Pré-requisito do Supabase

A fundação mínima de autenticação foi materializada nas migrations `20260925000000_auth_multitenant_foundation.sql` e `20261018093000_auth_provisioning_runtime.sql`. Elas incluem as tabelas de cadastro pendente, desafios OTP, histórico de senha, eventos, rate-limit e as RPCs usadas pelo runtime. Ainda é obrigatório validar a sequência inteira em um projeto Supabase de staging antes de qualquer produção.

Os objetos cobertos são:

- tabelas `pending_registrations`, `email_challenges`, `password_history`, `security_events`, `system_events` e `notification_deliveries`;
- RPCs `lookup_auth_user_by_email`, `consume_auth_rate_limit`, `claim_email_challenge` e `provision_verified_account_v2`;
- colunas de status e autoria necessárias para workspaces e membros.

Aplique as migrations de `supabase/migrations` em um projeto vazio somente em staging primeiro, valide as dependências e confirme o fluxo completo de cadastro, OTP, login e convite antes de promover.

O template não contém um vínculo com um projeto Supabase específico. Defina
`VITE_SUPABASE_PROJECT_ID` e `EXPECTED_SUPABASE_PROJECT_REF` com o identificador
do seu próprio projeto, além das URLs e chaves no ambiente de execução.

As variáveis `HEALTHCHECK_SECRET`, `CRON_SECRET` e
`INTEGRATION_TEST_ALLOWED_HOSTS` são opcionais para desenvolvimento, mas devem
ser configuradas separadamente quando os endpoints protegidos de diagnóstico,
recovery ou integrações administrativas forem habilitados. Nunca reutilize
`AUTH_CRYPTO_SECRET`, a chave do Evolution ou uma chave do Supabase para esses
papéis.

O nome público inicial pode ser ajustado com `VITE_PLATFORM_BRAND_NAME`; essa
variável é pública e não deve receber segredos. Depois do login, a marca do
workspace autenticado tem precedência.

## Ordem recomendada

Para convites com permissões personalizadas, aplique também
`20261019110000_workspace_permission_overrides.sql`. O servidor normaliza as
permissões e impede escalada de cargo; o frontend apenas oferece a edição.

Se o template já recebeu as migrations de privacidade anteriores, aplique
também `20261019120000_privacy_runtime_repair.sql`: ele permite o estado
`manual_review` usado pela fila de correções e disponibiliza a exclusão
transacional apenas ao `service_role`. A migration é aditiva e idempotente.

Depois da base de conhecimento, aplique `20261019150000_privacy_knowledge_cleanup.sql`. Ela completa o export/delete de privacidade para os documentos de conhecimento sem expor uma RPC destrutiva adicional.

Por fim, aplique `20261020100000_revoke_legacy_anon_inbox_grants.sql` para
remover privilégios anônimos legados que possam ter sido reintroduzidos por
migrations antigas de realtime. Ele preserva o acesso autenticado protegido
por RLS e o acesso server-side via `service_role`.

1. Crie um projeto Supabase de staging separado.
2. Materialize e revise o SQL histórico da fundação Auth/multi-tenant nesse staging.
3. Aplique as migrations deste diretório em ordem, sem `db reset` em produção.
4. Execute `npm run audit:release`, `npm run audit:prod`, os testes e os smoke
   tests autenticados.
5. Execute `npm run audit:public` para confirmar que nenhum segredo ou artefato
   local entrou no fork.
6. Só depois configure a Vercel e os segredos server-side.

Para validar a superfície pública de autenticação localmente, inicie o Vite em
`3001` e execute `node scripts/validate-ui-updates.mjs`. O script verifica os
temas, o aceite legal com scroll obrigatório, o modal de termos e o estado do
checkbox sem acessar dados reais.

O gate de release (`npm run release:check`, usado antes de promover na Vercel)
falha de propósito quando `EXPECTED_SUPABASE_PROJECT_REF` não está
definido. Isso evita publicar o frontend apontando por engano para o banco de
outra instalação. `npm run build` continua disponível como compilação local sem
o preflight de credenciais.

Até que a validação em staging seja concluída, o status correto do template é **não homologado para produção**. Isso não impede o uso local ou a criação de um banco de teste.

A cópia pública deve conter apenas `.env.example`. Arquivos locais como `.env`,
`.env.local`, `.dev.vars`
e credenciais de Vercel/Evolution nunca devem ser publicados.
