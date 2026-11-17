# InboxOS — Fase 10: recibos Evolution e status de saúde (02/10/2026)

## Escopo implementado

1. O cálculo de `evolutionEventKey` passou a considerar o payload de **eventos de atualização**, evitando descartar o status READ como duplicata do status DELIVERED para o mesmo ID. Eventos de criação (`MESSAGES_UPSERT`, `MESSAGES_SET`, `SEND_MESSAGE`) continuam deduplicados pelos IDs; serialização de IDs é inequívoca.
2. `MESSAGES_UPDATE`/`SEND_MESSAGE_UPDATE` agora reconhecem status textuais e códigos numéricos 2/3/4/5, respeitam transições monotônicas por filtro **atômico** `.in('status', previousStatuses)` no banco e verificam os erros de gravação. Isso impede regressão de READ para SENT e evita concluir eventos quando Postgres rejeita a atualização.
3. `GET /api/health?detailed=true` passou a apresentar o modo de entrega configurado e a flag de recuperação, sem `queueConfigured: true` fixo. O acesso detalhado continua exigindo autenticação.
4. Lógica pura de chave, status e diagnóstico foi isolada para permitir testes reais locais sem credenciais.

## Evidências locais (sem homologação externa)

- `npm test`: 166 testes aprovados, zero falhas.
- `npm run audit:release`: 263 arquivos TS/TSX/MTS sem erro sintático; nenhum import local ausente; 83 rotas representadas. O gate geral permanece vermelho porque o lockfile ainda diverge em 6 entradas, incluindo o plugin Netlify sem resolução registrada.
- Typecheck estrito **somente** dos novos módulos puros (`message-status.ts`, `health-diagnostics.ts`): PASS. Não equivale ao `tsc --noEmit` do app inteiro.
- Supabase conectado: consulta somente leitura confirmou as colunas `messages.workspace_id`, `messages.external_id` e `messages.status` e Advisor de segurança sem alertas no momento da consulta. Nenhum dado do cliente foi alterado.
- Não houve DDL nem deploy. Billing continua OFF por padrão.

## Limites

O sistema **NÃO está homologado para produção**. A compilação real ainda exige instalar dependências e reconciliar o lockfile. Testes locais usam mocks e validação estática, não uma sequência HTTP autenticada completa nem eventos Evolution reais. Ver `docs/WORK_BRIEF_FASE10_2026-10-02.md` para os procedimentos externos estritamente necessários.
