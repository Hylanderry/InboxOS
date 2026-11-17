# InboxOS — Fase 4: continuidade de produção e handoff para Work

**Data:** 02/10/2026. **Base:** `inboxos-finalizacao-fase3-2026-10-02.zip`. **Conclusão:** correções locais verificadas; release segue bloqueada para produção.

## Mudanças implementadas

1. `src/server/middleware/auth.ts`: o rate limiter das mutações autenticadas passou a derivar seu escopo só do `user.id`, evitando chaves baseadas em `x-forwarded-for`/IP informado pelo cliente. A atualização de `last_seen_at` deixou de ser um query builder descartado e passou a ser `await`, no máximo a cada 5 minutos. Erros de atualização de telemetria são registrados sem expor tokens.
2. `tests/staging-target-policy.ts`: smoke remoto exige URL de preview específica `deploy-preview-N--SITE.netlify.app`; localhost continua autorizado para testes locais. Compara o endereço declarado de produção, bloqueia hosts arbitrários/enganosos.
3. `.github/workflows/staging-smoke.yml` delega a checagem de origem à nova rotina `scripts/validate-staging-target.mjs`, eliminando uma implementação redundante e mais permissiva.
4. `tests/runtime-auth-hardening.test.ts`, `tests/staging-target-policy.test.ts` e `package.json` ampliam a suíte local.
5. `docs/WORK_HANDOFF_PRODUCAO_2026-10-02.md`, `docs/QA_EVIDENCIAS_RELEASE.md` e `docs/WORK_PROMPT_2026-10-02.md` fornecem contexto, prioridades, exigências de acesso e critérios de homologação para executar as pendências no ChatGPT Work.

## Evidência local desta versão

| Checagem | Resultado comprovado |
|---|---|
| `npm test` | **119/119 aprovados**, código 0 |
| `node scripts/audit-release-readiness.mjs` | Sintaxe: **252 TS/TSX/MTS**, 0 erros; imports: **0 ausentes**; rotas: **83**, 0 ausências; Billing OFF. **Exit code 1** porque lockfile diverge |
| Lockfile | **6 divergências**, incluindo adaptador Netlify ausente, dependências antigas no lock |
| `npm ci --offline` | **ENOTCACHED**, adaptador Netlify não está no cache |
| `npm view ...` com registry externo | **EAI_AGAIN** (falha DNS no executor, nesta execução) |
| `npm run lint`, TypeScript completo e build Vite/Netlify | **Não validados**; falta instalar dependências |
| SQL staging, HTTP autenticado, Evolution, Groq, Resend, Deploy Preview e mobile | **Não validados**; exigem acessos/ambientes reais |

**Observação:** os 119 testes são unitários/estáticos; não afirmam que todos os endpoints, jobs e provedores foram testados em rede. SQL e dados do Supabase de produção não foram modificados. Não ocorreu deploy, envio real de mensagem ou campanha.

## Pendências E0–E6

Consulte `docs/WORK_HANDOFF_PRODUCAO_2026-10-02.md`. Resumo: E0 inventário + branch; E1 npm/lock/lint/tsc/build; E2 Supabase staging/migrations/RLS; E3 autenticação e HTTP/E2E; E4 Evolution/Groq/Resend/Newsletter; E5 Deploy Preview/CI/responsividade; E6 backup, aprovação e go-live com rollback.

**Critério de encerramento:** todos os gates comprovadamente aprovados e autorização explícita para operações de produção. Não desabilitar verificações para simular aprovação.
