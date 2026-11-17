# InboxOS — pacote de hardening e validação local (01/10/2026)

## Base escolhida
`inboxos-core-adm-2026-10-01.zip` (ADM completo, 81/81 testes locais no baseline). **Não** corresponde ao ZIP consolidado baseado no estado de 30/09, que não tem todos os handlers administrativos presentes aqui.

## Alterações nesta revisão

1. `src/server/admin/bootstrap-policy.ts` — novo verificador puro e testável para bootstrap: identidade Auth deve possuir mesmo userId da sessão, e-mail exato na allowlist e `email_confirmed_at` válido. Não usa `user_metadata` para conceder privilégios.
2. `src/server/admin/admin-auth.server.ts` — consulta `auth.admin.getUserById` no servidor antes de chamar RPC atômica `claim_system_admin_bootstrap`. Desabilitar allowlist assim que o primeiro admin estiver ativo.
3. `src/server/admin/admin-operations.server.ts` — novo System Admin ativo deve ter e-mail confirmado; erros SQL `23514` de invariantes retornam HTTP 409 ao invés de 500 para suspensão de usuário, remoção/rebaixamento de membro e edição de System Admin.
4. `supabase/migrations/20261001230000_protect_last_privileged_members.sql` — triggers adicionais com `pg_advisory_xact_lock` para proteção concorrente do último owner, último superadmin e suspensão global do último superadmin. Funções no schema `private`, `SECURITY INVOKER`, sem `db reset` ou execução direta no vivo.
5. `tests/admin-hardening.test.ts` e `package.json` — verificações de elegibilidade real, correspondência Auth, migração e mapeamento de conflitos; integração à suíte.
6. `scripts/audit-release-readiness.mjs` — auditoria offline de parsing TS/TSX, imports, routeTree, flags Billing e dependências vs lockfile.

## Resultados executados

- `npm test`: **86/86 testes passaram** (baseline: 81/81).
- Parser TypeScript: **248 arquivos**, 0 erros de parsing.
- Imports relativos e `@/`: **0 ausentes**.
- Route tree: **83 rotas**, 0 rotas faltantes na árvore atual.
- Flag Billing: checada em backend + frontend; OFF como padrão.
- Auditoria da existência das dependências no lockfile: **BLOQUEADA — falta `@netlify/vite-plugin-tanstack-start` em `package-lock.json`**.
- O ambiente não resolve `registry.npmjs.org`, e não contém `node_modules`: **lint, tsc com dependências, build e integração HTTP/E2E não homologados**.
- Inspeção somente leitura do banco vivo mostrou tabelas `workspace_members`, `system_admins` e `system_user_controls` com `role`/`status` esperados; um trigger `guard_last_active_superadmin` já existe, mas a função observada faz verificação por contagem, sem lock concorrente explícito. Isso **não valida nem aplica** a migration nova.

## Próximos gates obrigatórios em ambiente conectado

1. Conferir `npm install`, diff do lockfile e versionar `package-lock.json` gerado pelo npm (não inventar hashes).
2. `npm test && npm run audit:release && npm run lint && npx tsc --noEmit && npm run build`.
3. Antes de aplicar a migration, reconciliar timestamps e conteúdo das migrations antigas com o Supabase; aplicar primeiro em clone/staging, testar downgrade de owners simultâneos, suspensões concorrentes e rollback.
4. Em Deploy Preview com usuários sintéticos, rodar `npm run test:integration`, matriz HTTP 401/403/404/200/201, Auth, OTP, dois tenants e operações de ADM.
5. Smoke real com Evolution QR/webhooks/media, Groq e Resend opt-in, sem enviar newsletter a destinatários reais não consentidos.
6. Testes visuais e performance em aparelhos reais, mais rollback validado antes de produção.

## Restrições preservadas

- Billing `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false` no core; cobrança permanece no fork futuro.
- Bilinguismo fora de escopo.
- Não foram modificadas credenciais, usuários ou tabelas do banco vivo; nenhum deploy executado.

**Classificação:** código modificado e testes locais aprovados; release ainda bloqueado para produção por lockfile, build e integrações reais pendentes.
