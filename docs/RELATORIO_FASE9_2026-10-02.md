# InboxOS — Relatório técnico da Fase 9

**Versão-base:** Fase 8 de 02/10/2026. **Objetivo:** corrigir URL de webhook em preview, impedir mutação de webhook de produção por prévias e limitar consumo de memória no recebimento de eventos grandes.

## Modificações no código

- `src/server/evolution/webhook-url.ts` (novo): origem confiável e opt-in para mutações remotas em preview.
- `src/lib/evolution.server.ts`: `publicWebhookUrl()` delega para origem confiável; guard de preview antes de configure.
- `src/server/evolution/webhook-body.ts` (novo): leitura com limite real de bytes, tratamento de UTF-8 incorreto, leitura em partes.
- `src/routes/api/public/webhooks/evolution.ts`: HTTP 413 para body grande; HTTP 400 para JSON/UTF-8 inválidos.
- `.env.example` e `.env.netlify.example`: `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false` por padrão.
- `tests/evolution-ingress-boundary.test.ts` (novo): 6 casos de regressão.
- `package.json`: inclui a nova suíte no `npm test`.

## Matriz de evidências

| Gate | Estado | Evidência |
| --- | --- | --- |
| Testes Node locais | PASS | 155/155 |
| Verificação sintática/imports/routeTree | PASS | 260 TS/TSX/MTS, 0 erros; 83 rotas |
| Integridade de lockfile | FAIL/BLOCKED | 6 divergências já presentes na Fase 8 |
| npm registry | BLOCKED | DNS EAI_AGAIN |
| ESLint, `tsc --noEmit`, build Vite Netlify | BLOCKED | dependências ausentes; não demonstrados |
| Tests HTTP e integrações E2E | BLOCKED | requer staging e credenciais sandbox |
| Supabase Security Advisor | PASS (consulta de leitura) | Sem lints na última consulta |
| Migration de proteção no banco vivo | NOT APPLIED | arquivo local sem aplicação em produção |
| Deploy produção | NOT DONE | aprovação e homologação pendentes |

**Não há certificação de produção.** Consulte o handoff econômico da Fase 9 para os únicos gates ainda necessários. Nenhuma alteração remota foi executada.
