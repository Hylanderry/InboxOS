---
name: inboxos-backend-release
description: "Executa com segurança o handoff técnico do InboxOS para Codex/Antigravity: npm lockfile, CI, Netlify, Supabase staging, RLS, Evolution API, idempotência, filas, auth e gates de produção. Usar para correção de backend ou homologação, nunca como licença para operar produção."
---
# InboxOS backend & release — Skill para Antigravity/Codex

## Pré-leitura inegociável
1. `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md` (fonte de verdade mais recente)
1b. `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md` (não regredir frontend)
1c. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md` (histórico somente)
2. `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`
3. `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`
4. `.agents/rules/evolution-staging.md` e `.agents/rules/supabase-production-safety.md`
5. `package.json`, `package-lock.json`, scripts e migrações atuais

## Execução ordenada
- G0: checksum do ZIP/commit, branch de trabalho, inventário, segredos e refs de staging/produção redigidas.
- G1: npm oficial -> corrigir lock -> `npm ci` -> unit -> lint -> TypeScript -> build -> gated build. SEM `--force`, `--legacy-peer-deps`, checksum inventado ou desativação do gate.
- G2: Supabase **staging separado**, SELECT read-only primeiro, comparar schema real, migrações versionadas, RLS, concorrência e restores.
- G3: API/handlers/queues/Evolution RPC com 2 tenants e 2 instâncias, respostas idempotentes, erros não mascarados.
- G4: Evolution/Resend/Groq exclusivamente em sandbox; executar E01–E22; nenhum número de cliente real.
- G5: Netlify Deploy Preview + HTTP smoke, QA visual via skill UI/UX, logs e testes negativos.
- G6: decisão NO-GO até todos os P0 passarem; rollback e aprovação explícita para produção.

## Não fazer
- Nenhum `supabase db reset`/`db push`/`migration repair`, reprocessamento de backlog, reenvio, deploy/prod sem autorização e ambiente confirmado.
- Nenhuma `service_role` no frontend, credencial no Git, secrets em log ou troca de permissões RLS para `USING(true)` para contornar erro.
- Nenhum downgrade silencioso de TanStack/Netlify/Vite, alteração em massa de endpoints, fork de billing reativado, novo SDK não aprovado.
- Nenhum `PASS` sem execução/log e nenhum patch deliberadamente sem teste de regressão.

## Formato de saída por tarefa
`ID | problema | causa evidenciada | arquivos | correção mínima | possível impacto | teste antigo | novo teste | evidência | PASS/FAIL/BLOCKED/NOT RUN | rollback`.
Encerrar com tarefas abertas, blockers restantes, hash/branch e nenhum segredo.
