# InboxOS — Fase 6 / recuperação automática da fila Evolution

**Data:** 02/10/2026. **Status:** implementada e validada por testes locais. **Não certificada em Netlify/Supabase staging nem produção.**

## Código implementado

- `src/server/evolution/recovery-policy.ts`: classificação pura de `queued` antigo, `failed` vencido (inclusive legado sem `next_attempt_at`) e `processing` interrompido; teto de 5 tentativas, carência de 90 segundos para `queued` e janela conservadora de 20 minutos para `processing` (background Netlify até 15 minutos).
- `src/server/evolution/recovery.server.ts`: busca limitada por status no Supabase (`service_role` somente no servidor), intercalando categorias para evitar starvation; mudança transacional condicional de status/attempts/timestamp antes de retomar jobs interrompidos; deduplicação; limite de 18 eventos e 3 envios simultâneos; falha de envio deixa estado durável para próxima rodada; logs apenas com contadores.
- `netlify/functions/evolution-recover.mts`: Netlify Scheduled Function a cada dez minutos (UTC). **Não executa nada até** `ENABLE_EVOLUTION_RECOVERY=true`. Exige `PUBLIC_APP_URL` HTTPS; disparos de background autenticados e limitados a 3 segundos; não envia payloads de WhatsApp aos endpoints, somente UUID do evento.
- `src/server/evolution/background-dispatch.ts` e `netlify/functions/evolution-events.mts`: assinatura HMAC para chamada da função background agora inclui ID e timestamp (janela de quinze minutos). Continua a assinatura separada de cinco minutos na chamada do consumidor de fila ao webhook.
- `src/server/evolution/event-inbox.ts`: compartilha teto de tentativas e persiste falha HTTP pela mesma atualização CAS do catch, para não escrever estados duas vezes.
- `scripts/lib/release-validation.mjs`: bloqueia build no contexto production se a recuperação não estiver explicitamente habilitada.
- `tests/evolution-recovery.test.ts`: testes reais das funções puras e do fluxo de recuperação usando banco simulado; valida comparação condicional, timeout, lote e assinatura da invocação HTTP com fetch simulado.

## Configuração

- Requer `ENABLE_EVOLUTION_RECOVERY=true` **apenas quando staging já demonstrar recuperação real** e houver aprovação do release.
- Não expor `SUPABASE_SERVICE_ROLE_KEY` nem `AUTH_CRYPTO_SECRET` como variáveis `VITE_*`.
- Cron `*/10 * * * *` economiza invocações em comparação com cada 1 ou 5 minutos, à custa de atraso adicional para recuperar eventos órfãos.
- O scheduled job somente roda no horário nos deploys publicados; Deploy Previews **não** disparam o agendamento sozinhos. Usar *Run now* da Netlify em site de staging publicado ou teste manual permitido na UI. Referência oficial: https://docs.netlify.com/build/functions/scheduled-functions/.
- A função Scheduled dispõe de 30 s; Background Functions dispõem de até 15 min. Referências: https://docs.netlify.com/build/functions/configuration/ e https://docs.netlify.com/build/functions/background-functions/.

## Provas nesta fase

- `npm test`: **135/135 PASS**, zero falhas.
- `npm run audit:release`: TypeScript **255 arquivos/0 erros de sintaxe**, imports **0 faltando**, file routes **83/83**; **falha de lockfile com seis divergências**.
- `npm ci --offline`: `ENOTCACHED` no adapter `@netlify/vite-plugin-tanstack-start`; npm registry DNS `EAI_AGAIN`; `npm run build`: `vite: not found`.
- Supabase: consultas read-only confirmaram colunas e índices existentes de `evolution_events`; Security Advisor retornou sem lints na consulta de 02/10.

## Limitações explícitas

A validação com banco simulado testa a lógica, **não prova CAS concorrente PostgreSQL real**. Sem install npm não há ESLint, typecheck integral nem build. Um evento pode ter efeitos externos antes de uma interrupção do worker; o tratamento definitivo desses efeitos requer testes E2E de idempotência e integração. Não foram rodados cron/Netlify real, migrações, nem reenvio de mensagem de teste. Não houve escrita no Supabase vivo.
