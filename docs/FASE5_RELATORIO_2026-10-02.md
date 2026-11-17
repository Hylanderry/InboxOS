# InboxOS — Relatório da Fase 5 (02/10/2026)

**Base:** `inboxos-fase4-work-handoff-2026-10-02.zip` (código completo da Fase 4).
**Nova entrega:** `inboxos-fase5-evolution-hardening-2026-10-02.zip`.
**Situação:** hardening local concluído; **produção ainda NÃO homologada**.

## Modificações

- Webhook Evolution: remove token na query; processamento interno só com HMAC assinada e timestamp de cinco minutos vinculada ao ID e ao corpo; token Evolution não substitui assinatura interna.
- Rate limiter: sem IP em cabeçalhos falsificáveis; chave da quota derivada do token via hash; em erro do banco falha fechada com HTTP 503; quota 1.200/min por token.
- Worker: claim condicional `status/attempts` para impedir dupla execução concorrente do mesmo evento; exceções registradas como `failed` com backoff ou `dead_letter` após limite; marcadores de finalização condicionais.
- Testes dinâmicos adicionais da assinatura e de interpretação do RPC, mais invariantes estáticos de ligação handler/worker.

## Gates locais

| Gate | Status | Evidência |
|---|---|---|
| Node testes `npm test` | PASS | 124/124 testes aprovados |
| Parse de TypeScript | PASS | 252 arquivos, zero erros sintáticos |
| Imports relativos/alias | PASS | zero ausências |
| Rotas | PASS | 83 representadas |
| Billing OFF | PASS | flags protegidas |
| Integridade do lockfile | FAIL | seis divergências pendentes |
| Regenerar lockfile com npm | BLOCKED | `registry.npmjs.org` -> `EAI_AGAIN` |
| `npm ci`, lint, tsc, build | BLOCKED | falta registry npm/dependências reais |
| API E2E, Netlify preview, concorrência Supabase | BLOCKED | não foi executado estágio real nesta sessão |

Os testes locais **não** provam que o serviço foi compilado ou que webhooks/filas funcionem no deploy. Nenhuma operação de escrita no banco vivo, nem deploy, nem envio de mensagens foi realizada nesta fase.

## O que falta, por etapa

**E1 — Build (P0):** com Node 22 e acesso npm, regenerar e revisar `package-lock.json`, instalar pacote, `npm test`, `npm run audit:release`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; corrigir erros e registrar logs.

**E2 — Banco (P0):** reconciliar migrations, aplicar proteção de ownership em staging, verificar RLS e a fila com `evolution_events`; rodar testes transacionais (workers simultâneos e recovery de timeout).

**E3 — Auth/API (P0):** testes HTTP autenticados com dois tenants e várias roles, OTP/recovery, 401/403/409/429/503 e idempotência.

**E4 — Evolution e serviços (P0):** homologar HMAC interno, rate 429/503, retry/backoff, recuperação periódica de falhas de fila, deduplicação, QR, contatos, mídia, Groq e Resend de teste; não enviar a contatos reais.

**E5 — UI/Preview (P1):** branch/CI, preview Netlify, mobile/desktop, monitoramento, headers, performance e regressão.

**E6 — Lançamento (P0):** backup/rollback e aprovação explícita antes de migrations/credenciais e deploy de produção.

Consulte `docs/FASE5_EVOLUTION_HARDENING_2026-10-02.md` no ZIP e o **handoff atualizado para Work** anexado separadamente.
