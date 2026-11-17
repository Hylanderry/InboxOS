# InboxOS — Checklist de deploy / release candidate

Data: 27/09/2026
Alvo: Netlify + Supabase + Evolution API + Resend

## Estado funcional fechado nesta release

- Auth humano sem `local-user`, `DEFAULT_WORKSPACE_ID`, UUID tenant default ou Cloudflare Access.
- App session revogável vinculada ao `session_id` do JWT Supabase.
- Login com challenge de dispositivo, trusted device e reenvio de OTP.
- Cadastro PF/PJ, CNPJ matemático, telefone E.164, legais e convite de workspace.
- Recovery anti-enumeração, grant curto e bloqueio das 3 últimas senhas.
- Troca de e-mail em duas confirmações e alerta para e-mail antigo.
- Troca de telefone por challenge.
- Perfil, avatar, empresa, logo, sessões, dispositivos, workspaces, membros e convites ligados à tela Configurações.
- Resend centralizado em `system_events -> notification_deliveries -> Resend`, com idempotency e retry para 429/5xx.
- Evolution com `InstanceContext`/workspace explícito e webhook que resolve ownership pelo banco.
- Netlify Background Function para processamento durável de `evolution_events`.
- Cloudflare Queue permanece somente como compatibilidade se o binding existir.
- Rate-limit de mutações protegidas independente de Cloudflare (usuário + IP) e rate-limit próprio de webhook.
- `routeTree.gen.ts` reconstruído com as 61 rotas reais e sem Lovable/MCP/well-known antigos.
- Billing permanece placeholder intencional; não existe cobrança fake.

## Variáveis obrigatórias na Netlify

### Browser/build

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

### Runtime server

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
AUTH_CRYPTO_SECRET
PUBLIC_APP_URL
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_WEBHOOK_TOKEN
RESEND_API_KEY
RESEND_FROM_EMAIL
```

`AUTH_CRYPTO_SECRET` deve possuir pelo menos 32 caracteres aleatórios e nunca usar prefixo `VITE_`.

### Conforme cron/rotas auxiliares habilitadas

```text
SYSTEM_CRON_SECRET
SYSTEM_CRON_SECRET_PREVIOUS
```

O `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, Evolution secret/API key e Resend key são estritamente server-side.

## Netlify

`netlify.toml` usa:

```text
build command: npm run build
publish: dist/client
Node: 22.16.0
npm: 10.9.2
```

A função `netlify/functions/evolution-events.mts` está configurada com `background: true` e path `/api/background/evolution-events`.

`PUBLIC_APP_URL` deve apontar para a URL HTTPS canônica da aplicação. Não existe mais fallback silencioso para domínio Worker antigo.

## Evolution

Configurar o webhook da Evolution para:

```text
https://SEU_DOMINIO/api/public/webhooks/evolution
```

E usar o mesmo segredo de `EVOLUTION_WEBHOOK_TOKEN` no provedor. O endpoint também aceita `apikey` por compatibilidade, mas o token de webhook separado é recomendado.

Eventos pesados entram em `evolution_events`; na Netlify são consumidos pela Background Function. O workspace é sempre resolvido por `instance_name` previamente cadastrada.

## Supabase vivo

Projeto: `aczstooavclxhmgtsobg`.

Ver `docs/reconciliation/SUPABASE_LIVE_STATE_2026-09-27.md`.

- Security Advisor: 0 lints na última verificação.
- Warning de índice duplicado resolvido pela migration `20260927102921`.
- Teste real Tenant A × B passou nos dois sentidos e os fixtures foram removidos.

## Verificações locais já executadas

```text
npm test
70 tests
70 pass
0 fail
```

Também foi executado parse TypeScript/TSX dos fontes via TypeScript 5.8 global:

```text
214 arquivos analisados
0 arquivos com erro sintático
```

A árvore de rotas foi comparada com todos os `createFileRoute()`:

```text
61 rotas source
61 rotas no routeTree
0 rotas ausentes
0 Lovable
0 /mcp legado
0 /.well-known legado
```

## Bloqueio do ambiente atual

Este container não resolve DNS externo, inclusive `registry.npmjs.org` e o domínio Supabase. O cache npm está vazio.

Por isso, neste ambiente não foi possível concluir:

```text
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm run test:integration com servidor iniciado
smoke test Netlify pós-deploy
matriz visual F9 em navegador real
```

`npm ci --offline` também falha porque não há cache local.

Isso é um bloqueio de infraestrutura do executor, não evidência de sucesso desses comandos. A release só deve ser chamada de **verificada para produção** depois que os comandos abaixo passarem em um ambiente com acesso ao registry.

## Gate obrigatório antes de publicar tráfego real

O `package.json` já fixa `@netlify/vite-plugin-tanstack-start@1.3.19`, porém o `package-lock.json` do checkpoint anterior ainda não contém esse pacote. Como este executor não possui rede, não foi possível atualizar o lockfile com segurança.

Na **primeira** máquina/CI com acesso ao registry, executar:

```bash
npm install
git diff -- package-lock.json
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:integration
```

Depois de revisar e versionar o `package-lock.json` atualizado, os próximos builds reproduzíveis devem voltar a usar:

```bash
npm ci
```

A Netlify usa `npm install` por padrão em projetos npm, portanto o deploy preview pode resolver essa dependência a partir do `package.json`; ainda assim, o lockfile deve ser reconciliado antes de tratar a release como totalmente reproduzível.

Para `test:integration`, iniciar a aplicação conforme o contrato do teste ou configurar a base URL usada pela suíte.

Depois:

1. Deploy preview Netlify.
2. `GET /api/health` deve retornar 200/`status=ok`.
3. Testar cadastro -> verify -> login -> challenge de device -> logout/login.
4. Testar recovery e troca de senha.
5. Testar Perfil/Empresa/Workspace/convites na UI.
6. Conectar uma instância Evolution de teste, validar QR/webhook e sincronização.
7. Enviar/receber mensagem e mídia.
8. Confirmar `evolution_events` terminando como `completed`, sem fila crescente em `failed/dead_letter`.
9. Confirmar linhas em `system_events` e `notification_deliveries` para e-mails transacionais.
10. Rodar novamente Security + Performance Advisor.
11. Executar matriz visual F9: 320/360/390, tablet, desktop, landscape, viewport curto, teclado móvel, safe-area, Dock, Inbox, Configurações, Auth e sheets/modais.
12. Promover o deploy preview para produção somente depois desses checks.

## Débito de reprodutibilidade do banco

O banco vivo possui migrations exatas de 25–26/09 que ainda não estão integralmente materializadas no diretório local `supabase/migrations`. Isso **não impede o deploy desta aplicação contra o projeto vivo atual**, mas impede afirmar que o repositório sozinho recria um projeto Supabase novo bit a bit.

Não resetar nem reaplicar migrations do banco vivo para corrigir isso. A tarefa correta é exportar/materializar o histórico SQL exato em um ambiente com conexão ao Supabase CLI/MCP e depois comparar a lista local com `supabase_migrations.schema_migrations`.

## Artefatos de referência

- `docs/API_ENDPOINTS.md` — catálogo completo dos endpoints.
- `docs/reconciliation/SUPABASE_LIVE_STATE_2026-09-27.md` — estado real do banco e teste A×B.
- `.env.netlify.example` — lista de variáveis sem secrets reais.
- `netlify.toml` — configuração do build.
