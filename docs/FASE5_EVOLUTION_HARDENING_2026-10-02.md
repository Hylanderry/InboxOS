# InboxOS — Fase 5: webhook Evolution e controle de fila

**Data:** 02/10/2026. **Status:** mudanças implementadas em código e cobertas por testes locais. **NÃO homologado para produção.**

## Alterações implementadas

1. O endpoint `/api/public/webhooks/evolution` não aceita mais `?token=` na URL: a autenticação deve usar `x-webhook-token` ou `apikey`. Evita exposição da credencial em logs, URLs e proxies. O emissor Evolution configurado pelo projeto usa header, mas instalações legadas com query string precisam ser reconfiguradas antes do deploy.
2. `x-inbox-queue-consumer: 1` agora precisa de HMAC interna, independente do segredo público do provedor. Assinatura SHA-256 HMAC (`AUTH_CRYPTO_SECRET`) cobre `eventId`, timestamp de emissão em milissegundos e corpo exato. Exige UUID, timestamp válido (janela de ±5 minutos) e assinatura em headers `x-inbox-event-id`, `x-inbox-sent-at`, `x-inbox-internal-signature`. Cabeçalho sozinho é rejeitado.
3. O rate limiter do webhook passou a falhar **fechado**: se o RPC estiver indisponível/retornar formato inesperado, responde HTTP 503 + `Retry-After` (em vez de processar sem controle). Quando excede quota, HTTP 429. A quota é calculada pelo SHA-256 da credencial validada, e não pelos cabeçalhos de IP enviados pelo cliente. Limite atual: 1.200 requisições por 60 segundos para o token (ajustar com medição em staging).
4. O processamento persistido em `evolution_events` usa *compare-and-swap* ao mudar `queued/failed -> processing` (`id`, `status` e `attempts`). Se outro worker já assumiu o evento, a cópia duplicada não processa. Exceções durante processamento geram `failed` com backoff ou `dead_letter` no limite, guardando a tentativa para não sobrescrever uma mais recente.

## Evidência local

- `npm test`: **124/124 PASS** (inclui testes HMAC com payload/tempo alterados, rate limiter fail-closed, verificações de código do produtor, endpoint e transições da fila).
- `npm run audit:release`: parse TypeScript **252 arquivos, 0 erros**; imports **0 faltantes**, árvore **83 rotas**; Billing flags OFF.
- **BLOCKED:** lockfile registra 6 divergências; `npm install --package-lock-only` falha em `registry.npmjs.org` com `EAI_AGAIN` neste executor. Não foi possível `npm ci`, `npm run lint`, `tsc --noEmit` nem `npm run build`.

## Riscos e testes obrigatórios em staging

- Testar webhook de entrada com cabeçalhos reais Evolution; rejeição de credencial por query string; assinatura válida/alterada/expirada; respostas 401/429/503 e comportamento de reentrega do provedor.
- Duas entregas simultâneas do **mesmo** `event_id`: somente uma transição para `processing` e somente um processamento externo. Os testes locais cobrem a intenção de CAS estaticamente, **não** substituem teste concorrente PostgreSQL/Netlify real.
- **P0: implementar/validar uma rotina periódica de recuperação de jobs:** um evento que ficou `processing` após queda sem `catch` (timeout/kill do worker) pode permanecer preso. Examinar reprocessamento de `failed`/`queued`, `next_attempt_at`, status `processing` obsoleto, política de lease, dead-letter e duplicidade após reentrega. Não liberar sem teste transacional e em staging.
- **P0: revisar caminho de duplicata na entrada:** a upsert `ignoreDuplicates` devolve 202 para chave já existente; se o evento existente estiver `failed/queued`, garantir que tenha mecanismo de reenvio/recovery confiável, em vez de tratar toda duplicata como resolvida.
- **P0: revisar idempotência pós-ACK:** se processamento de fases subsequentes falhar após mensagens persistidas, repetir o evento não deve duplicar mensagens/respostas. Cobrir falhas de rede/timeout nas etapas de IA, sync e provider.
- Ajustar quota de 1.200/min conforme carga e instâncias; validar limites, permissões, revogação/rotação da chave e não usar chave de produção em testes.
- Após confirmar `npm install` real, corrigir build/lint/typecheck sem desabilitar gates. Deploy e migrações apenas após aprovação explícita.

**Decisão de segurança:** mudanças desta fase devem ser mantidas com testes e logs; nenhuma credencial real, DDL ou dado de produção foi alterado.
