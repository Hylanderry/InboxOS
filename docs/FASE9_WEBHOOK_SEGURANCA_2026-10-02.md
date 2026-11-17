# InboxOS — Fase 9: isolamento dos webhooks Evolution e limite de requisições

**Data:** 02/10/2026. **Base:** `inboxos-fase8-economico-2026-10-02.zip`.

## Alterações implementadas (somente código local)

1. `publicWebhookUrl()` passa a usar `evolutionWebhookUrl(process.env)` com `trustedAppOrigin`: produção aponta a `PUBLIC_APP_URL`; Deploy Preview/branch deploy exige `DEPLOY_PRIME_URL` válido em `*.netlify.app`. Elimina divergência entre a origem dos workers/convites e a URL usada na configuração remota da Evolution.
2. `configureEvolutionWebhook()` falha antes de qualquer chamada ao provedor em contextos preview/branch sem `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=true`. Esse opt-in só deve existir com **instância Evolution de teste exclusiva**: configurar webhook remoto modifica o servidor Evolution, inclusive se os dois sites compartilharem o mesmo token.
3. Webhook da Evolution: leitura incremental do request limitada a **5 MiB**, tanto pelo `Content-Length` quanto pelos bytes realmente recebidos. Corpo excessivo retorna `413`; UTF-8 inválido/JSON inválido retorna `400`. O limite deve ser validado em staging com exemplos reais de mensagens que contenham mídia, pois eventos muito grandes deverão chegar por referência de mídia.
4. Testes determinísticos para URLs de produção/preview, falha segura, stream UTF-8 com emoji, corpo acima do limite, cabeçalho inválido e proteção da rota.

## Evidências locais

- `npm test`: **155 de 155** aprovados.
- `npm run audit:release`: parsing TS/TSX/MTS, imports e routeTree **aprovados**; lockfile com **6 divergências**, logo o gate geral está **BLOCKED**.
- `npm ping`: DNS do registry npm indisponível (`EAI_AGAIN`). Não há `node_modules`; sem ESLint/TypeScript completo/Vite build E2E demonstrados.
- Supabase conectado: inspeção **somente leitura**, Security Advisor `lints=[]`. Histórico remoto não contém `20261001230000_protect_last_privileged_members.sql`; validar em staging, **não aplicar ao banco vivo sem aprovação**.

## Atenção ao lançamento

A proteção de preview não substitui credenciais e tenants de teste. Mesmo com `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=true`, é obrigatório usar instância Evolution sandbox. Verificar, durante o teste da prévia, que o endereço do webhook registrado no provedor aponta apenas para o preview. Em produção o sinalizador deve ser `false` ou ausente.

**Release de produção NÃO homologado.** Nenhuma migração foi aplicada, nenhum e-mail/WhatsApp foi enviado, nenhum deploy foi realizado.
