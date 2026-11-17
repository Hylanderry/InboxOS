# InboxOS — Fase 7: destinos HTTP confiáveis e backoff da fila

**Data:** 02/10/2026. **Estado:** implementado e testado localmente, sem deploy nem escrita no banco vivo.

## Alterações efetivas

1. `src/server/security/trusted-app-origin.ts` é a fonte única da origem para links sensíveis e requisições internas. Em produção exige `PUBLIC_APP_URL` HTTPS com domínio DNS e sem caminho/query/credencial/porta não padrão. Em `CONTEXT=deploy-preview` ou `branch-deploy` exige `DEPLOY_PRIME_URL` de `*.netlify.app`; nunca redireciona acidentalmente uma prévia para a origem principal.
2. `src/server/workspace/workspaces.server.ts` e `src/server/admin/admin-invitations.server.ts` validam a origem **antes** de criar convites (inclusive no ADM global), para que links contendo tokens não usem Host/URL da requisição ou domínio malformado. Sem origem válida respondem 503 sem persistir convite.
3. `src/routes/api/public/webhooks/evolution.ts`, `src/server/evolution/event-inbox.ts`, `netlify/functions/evolution-events.mts` e `netlify/functions/evolution-recover.mts` deixam de derivar destinos HTTP de `Request.url`. Todos usam configuração do servidor e o mesmo validador. Reenvios encadeados usam helper de assinatura com timeout de 3 s.
4. O worker respeita `next_attempt_at` de eventos `failed` e, ao reivindicar o trabalho, compara novamente esse campo no `UPDATE` (CAS). Evita reduzir o backoff após reentrega duplicada ou atualização concorrente. Recuperação de estado `processing` mantém o mecanismo da Fase 6.
5. `tests/trusted-origin.test.ts` cobre produção, preview, origens malformadas, links sensíveis e caminho de retry, e os testes de fila anteriores foram atualizados para a consulta modificada.

## Evidências locais

- `npm test`: **141/141 PASS**.
- `npm run audit:release`: parse TS **256 fontes/0 erros**, imports relativos **0 faltantes**, **83 rotas presentes**, Billing OFF. FAIL apenas para **6 divergências existentes** do `package-lock.json`.
- Registry npm continua inacessível neste executor (`EAI_AGAIN`) e `node_modules` não está disponível. **Não** houve `npm ci`, ESLint, typecheck integral nem Vite build aprovados. Nenhum servidor HTTP real ou provedor foi exercitado.

## Aceitação em staging

- Netlify `CONTEXT=deploy-preview`: origem deve ser `DEPLOY_PRIME_URL` do preview. HTTP de reenvio e URLs de convites não podem atingir produção. Confirmar por logs sanitizados de destino (não incluir tokens, PII ou segredos).
- `CONTEXT=production`: confirmar `PUBLIC_APP_URL` corresponde ao host oficial e todos os checks de ENV são válidos.
- Fila Evolution: enviar job duplicado antes de `next_attempt_at` e confirmar que não modifica `attempts` nem chama o provedor. Após o prazo, apenas um worker pode efetuar CAS; reenvio seguinte deve respeitar backoff e teto de tentativas.
- Em falha de rede, a função background não deve permanecer presa; evento deve continuar disponível para o recovery.

Consulte `docs/WORK_HANDOFF_MINIMO_FASE7_2026-10-02.md` apenas para o restante que depende de executor externo. Não lançar produção com resultados locais apenas.
