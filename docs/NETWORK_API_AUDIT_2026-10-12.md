# Auditoria de APIs, rotas e comunicação — InboxOS

Data: 12/10/2026  
Escopo: código local Fase 16, endpoints públicos observáveis e serviços configurados. Nenhum segredo é registrado. Nenhuma escrita, migration, envio ou reprocessamento de produção foi executado.

## Resultado executivo

| Camada | Esperado | Observado | Status |
| --- | --- | --- | --- |
| Suíte automatizada | Regressões, escopo e contratos verdes | 287/287 testes aprovados | PASS |
| Auditoria estática | Imports/rotas/schema de arquivo coerentes | 273 fontes, 85 rotas, 0 imports quebrados | PASS |
| Supabase configurado | API autenticada e acessível | HTTP 200 usando configuração local | PASS |
| Evolution configurada | API autenticada e listagem de instâncias | HTTP 200; 8 instâncias retornadas | PASS |
| Rotas locais | Webhook POST, worker POST assinado, cron protegido | contratos locais 405/401 conforme esperado | PASS |
| Health local/staging | schema atualizado | `503 schema=outdated` por divergência de colunas | FAIL/BLOCKED |
| Vercel público | mesmo artefato do código local | worker/cron retornam 404; webhook é fallback antigo | FAIL/BLOCKED |
| Playwright autenticado | fluxo real com dados isolados | sem sessão/staging autenticado | NOT RUN |
| Produção | somente após staging e autorização | não publicada nem mutada | NO-GO |

## Contrato global de funcionamento

### Deve acontecer

- Toda leitura e escrita privada deve exigir sessão válida, workspace ativo e, quando aplicável, `instance_id`.
- Toda operação Evolution deve usar a instância selecionada e manter idempotência por evento/mensagem.
- Webhook deve aceitar somente payload assinado/autorizado, persistir o evento e despachar processamento durável.
- Eventos históricos não podem criar unread nem acionar IA automática; somente mensagens posteriores ao `connected_at` entram no fluxo vivo.
- Reentregas devem ser seguras, ordenadas por conversa e limitadas por concorrência.
- Chat, unread, preview e presença devem atualizar sem abrir a conversa.
- Mídia deve usar arquivo/mediaPath original; URL assinada nunca pode ser tratada como Base64.
- Nomes devem priorizar agenda salva, depois `push_name`, sem cruzar workspace ou instância.
- IA só pode responder se houver agente válido, habilitado e vinculado ao contexto correto.
- Billing permanece desligado.

### Não pode acontecer

- Não aceitar webhook GET como ingestão.
- Não processar evento sem token, assinatura ou vínculo de instância.
- Não importar histórico automaticamente, apagar chat visível ou substituir dados de outra instância.
- Não duplicar mensagem por timeout/retry ambíguo.
- Não enviar mensagem real em smoke test.
- Não expor segredo em resposta, log, frontend ou screenshot.
- Não ativar IA sem agente configurado.
- Não considerar build/teste unitário como prova de integração real.

## Inventário completo de endpoints

Os caminhos abaixo correspondem aos arquivos em `src/routes/api`. Parâmetros `$id`, `$name`, `$phone` e `*` são segmentos dinâmicos.

### Administração

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/admin/audit` | GET | auditoria somente para admin | protegido no código; E2E não executado |
| `/api/admin/integrations` | GET, POST, PATCH | listar/criar/editar integrações com vault server-side | protegido; sem teste autenticado |
| `/api/admin/integrations/rotate` | POST | rotacionar segredo sem devolvê-lo | protegido; sem execução real |
| `/api/admin/integrations/test` | POST | testar integração sem expor chave | protegido; sem execução real |
| `/api/admin/invitations` | GET, POST, PATCH | administrar convites globais | protegido |
| `/api/admin/me` | GET | retornar identidade/permissão admin | protegido |
| `/api/admin/members` | GET, PATCH | listar/alterar membros com escopo | protegido |
| `/api/admin/newsletter/audience` | GET, POST | audiência sem envio implícito | protegido |
| `/api/admin/newsletter` | GET, POST, PATCH | rascunho/configuração de newsletter | protegido |
| `/api/admin/newsletter/media` | POST | upload validado e limitado | contrato de mídia PASS; E2E não executado |
| `/api/admin/newsletter/send` | POST | envio somente após confirmação explícita | não executado |
| `/api/admin/overview` | GET | métricas administrativas | protegido |
| `/api/admin/system-admins` | GET, POST | administrar superadmins com política de posse | protegido |
| `/api/admin/users` | GET, PATCH | suspensão/alteração de usuários | protegido |
| `/api/admin/workspaces` | GET, PATCH | administração global de workspaces | protegido |

### Autenticação e segurança

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/auth/login/start` | POST | iniciar login/OTP com rate limit | contrato PASS; E2E real NOT RUN |
| `/api/auth/login/resend` | POST | reenviar OTP limitado | contrato PASS |
| `/api/auth/login/verify` | POST | verificar OTP e dispositivo confiável | contrato PASS; sessão real NOT RUN |
| `/api/auth/register/start` | POST | iniciar cadastro | contrato PASS |
| `/api/auth/register/resend` | POST | reenviar cadastro | contrato PASS |
| `/api/auth/register/verify` | POST | concluir cadastro após OTP | contrato PASS |
| `/api/auth/password/start` | POST | iniciar recuperação anti-enumeração | contrato PASS |
| `/api/auth/password/resend` | POST | reenviar recuperação limitado | contrato PASS |
| `/api/auth/password/verify` | POST | verificar desafio | contrato PASS |
| `/api/auth/password/reset` | POST | redefinir senha uma vez | contrato PASS |
| `/api/auth/email-change/old/start` | POST | desafio do e-mail antigo | contrato PASS |
| `/api/auth/email-change/old/verify` | POST | verificar e-mail antigo | contrato PASS |
| `/api/auth/email-change/new/start` | POST | desafio do e-mail novo | contrato PASS |
| `/api/auth/email-change/new/verify` | POST | confirmar alteração | contrato PASS |
| `/api/auth/email-change/cancel` | POST | cancelar fluxo | contrato PASS |
| `/api/auth/phone-change/start` | POST | iniciar alteração de telefone | contrato PASS |
| `/api/auth/phone-change/verify` | POST | confirmar alteração | contrato PASS |
| `/api/auth/security` | GET, POST | listar/revogar sessões e dispositivos | contrato PASS; E2E real NOT RUN |
| `/api/legal/status` | GET | status de aceite legal | protegido conforme contexto |

### Inbox, mensagens e realtime

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/chats` | GET | listar chats por workspace/instância, unread e preview | contratos de escopo PASS |
| `/api/chats/:id/messages` | GET | histórico cursorado do chat selecionado | escopo e mediaPath PASS |
| `/api/chats/:id/read` | POST | marcar localmente e sincronizar recibo conforme política | contrato PASS; celular real NOT RUN |
| `/api/chats/:id/ai-state` | POST | ativar/pausar IA somente com agente válido | contrato local PASS; E2E IA NOT RUN |
| `/api/chats/:id/flags` | POST | atualizar flags do chat | protegido; E2E NOT RUN |
| `/api/chats/:id/business-profile` | GET | perfil comercial do contato | protegido; E2E NOT RUN |
| `/api/chats/:phone/pause` | POST | pausar automação no contato | escopo exigido |
| `/api/chats/:phone/resume` | POST | retomar automação | escopo exigido |
| `/api/chats/:phone/presence` | POST | presença/digitando por instância | isolamento por instância PASS |
| `/api/chats/sync-pfp` | POST | atualizar fotos somente no tenant/instância | escopo PASS |
| `/api/events` | GET | snapshot/cursor incremental para realtime | contrato local PASS; autenticação real NOT RUN |
| `/api/messages/send` | POST | outbox idempotente, mídia e envio Evolution | contratos PASS; envio real NOT RUN |
| `/api/media/*` | GET | servir mídia privada somente no workspace | prefixo workspace PASS |
| `/api/media/upload` | POST | validar tipo/tamanho e armazenar mídia | contrato parcial; E2E de todos formatos NOT RUN |

### Evolution API e sincronização

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/public/webhooks/evolution` | GET, POST | GET=405; POST assinado, durável e sem inline pesado | local PASS; deployment público antigo |
| `/api/internal/evolution-events` | GET, POST | GET=405; POST somente com assinatura curta por evento | local PASS; público 404 |
| `/api/cron/evolution-recover` | GET | cron autenticado, lote limitado e opt-in | local 401 sem segredo; público 404 |
| `/api/sync/evolution` | POST | reparar webhook e sincronizar contatos/grupos, não histórico | contrato local; execução real não autorizada |
| `/api/instances` | GET, POST | listar/criar instâncias por workspace | protegido; Evolution retornou 8 instâncias via credencial local |
| `/api/instances/:name` | DELETE | excluir somente instância autorizada e seus dados | escopo PASS; não executado |
| `/api/instances/:name/qrcode` | GET, POST | consultar/gerar QR da instância | protegido; E2E real NOT RUN |

### Produto, CRM e workspace

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/agents` | GET, POST, PATCH, DELETE | CRUD de agentes com runtime_config e escopo | testes de personalização PASS; UI autenticada NOT RUN |
| `/api/agents/test` | POST | testar agente sem disparar cliente real | protegido; não executado |
| `/api/crm` | GET, POST, PATCH, DELETE | leads/contatos com workspace | contratos de escopo PASS |
| `/api/crm/stages` | GET, POST, PATCH, DELETE | etapas do funil | protegido; E2E NOT RUN |
| `/api/follow-up` | GET, POST, PATCH, DELETE | lembretes e follow-ups por workspace | protegido; E2E NOT RUN |
| `/api/dashboard` | GET | métricas carregadas com escopo | protegido; E2E NOT RUN |
| `/api/company` | GET, PATCH | dados da empresa | protegido |
| `/api/company/logo` | POST | upload de logo validado | protegido |
| `/api/profile` | GET, PATCH | perfil pessoal | contrato de segurança PASS |
| `/api/profile/avatar` | POST | avatar validado | protegido |
| `/api/workspaces` | GET, POST | listar/criar workspaces permitidos | contrato de escopo PASS |
| `/api/workspaces/activate` | POST | trocar workspace e invalidar realtime/cache | regressões F16 PASS |
| `/api/workspaces/members` | GET, POST | membros e convites do workspace | protegido |
| `/api/workspaces/invitations` | GET | listar convites | protegido |
| `/api/workspaces/invitations/create` | POST | criar convite | protegido |
| `/api/workspaces/invitations/accept` | POST | aceitar convite validado | contrato PASS |
| `/api/workspaces/invitations/revoke` | POST | revogar convite | protegido |

### Sistema e configuração

| Endpoint | Métodos | Comportamento esperado | Observado |
| --- | --- | --- | --- |
| `/api/health` | GET | informar conectividade e schema sem mascarar drift | Supabase acessível, mas 503 por schema desatualizado |
| `/api/billing` | GET | permanecer desativado até opt-in explícito | Billing OFF; não deve ser habilitado agora |
| `/api/admin/newsletter/*` | GET, POST, PATCH | operações administrativas sem envio implícito | protegido e sem execução real |

## Funções server-side

### Auth, sessão e políticas

`auth-crypto`, `login.server`, `registration.server`, `password-recovery.server`, `phone-change.server`, `email-change.server`, `profile.server`, `security-sessions.server`, `session-token`, `auth-context`, `auth-policy`, `sensitive-challenge-rate`, `legal-status.server`.

Devem validar sessão, OTP específico, expiração, revogação, rate limit e workspace. Não devem confiar apenas em `verified_at`, IP enviado pelo cliente ou dados de tenant fornecidos no body. Os contratos automatizados estão PASS; fluxo autenticado real ainda não foi executado.

### Evolution, fila e sincronização

`background-dispatch`, `chat-event`, `connection-sync`, `contact-identity`, `event-contract`, `event-inbox`, `event-key`, `event-policy`, `group-metadata-cache`, `group-participant-permissions`, `message-destination`, `message-query`, `message-scope`, `message-status`, `normalize-message`, `outbound-policy`, `recovery.server`, `recovery-policy`, `schema-contract`, `sync-engine`, `webhook-body`, `webhook-config`, `webhook-rate-limit`, `webhook-url`.

Devem receber eventos assinados, gravar identidade estável, deduplicar por instância, processar em fases limitadas, recuperar falhas e manter ordem por conversa. Não devem processar histórico como mensagem nova, cruzar tenants, fazer retry cego ou executar processamento pesado inline. Testes sintéticos PASS; integração real e publicação oficial BLOCKED.

### Produto, IA e administração

`workspace-product.server`, `agent-personalization`, `billing-flag`, `admin-auth.server`, `admin-invitations.server`, `admin-newsletter-audience.server`, `admin-operations.server`, `bootstrap-policy`, `integration-vault.server`, `media-signatures`, `newsletter.server`, `newsletter-render`, `vault-crypto`.

Devem manter autorização global/tenant, IA desativada sem agente válido, vault somente server-side e billing desligado. Personalização determinística e escopo IA estão cobertos por testes; tela autenticada e handover real permanecem sem E2E.

### Infraestrutura, segurança e integrações

`health-diagnostics`, `credentialed-fetch`, `trusted-app-origin`, `middleware/auth`, `middleware/access-auth`, `middleware/rate-limit`, `plugins/evolution-queue`, `workspaces.server`, `env`, `email/delivery.server`, `email/resend.server`, `email/resend-retry-policy`, `email/templates`.

Devem usar HTTPS, timeout, redirect bloqueado, origem confiável, segredos server-side e rate limits. Não devem aceitar host arbitrário, redirect para rede privada ou segredo no frontend/log.

## Diagnóstico de rede

1. **Local:** os handlers novos estão presentes no manifesto/roteador e os contratos GET/POST respondem conforme esperado.
2. **Supabase:** autenticação e transporte estão funcionando; o banco acessível não possui todas as colunas exigidas pelo código (`connected_at`, `identity_kind`, `runtime_config`), portanto o health check corretamente retorna `503`.
3. **Evolution:** autenticação e `fetchInstances` funcionam; isso prova conectividade, não prova webhook de cada instância.
4. **Vercel:** o host público não contém o artefato local atual. Worker e cron retornam 404 e o webhook é fallback antigo. Mensagens podem ser perdidas/truncadas porque o callback chega em runtime sem o pipeline durável corrigido.
5. **Realtime:** o código usa cursor/polling e invalidação por workspace; sem deployment atualizado, essa lógica não está disponível para usuários públicos.

## Correções necessárias para sair do NO-GO

1. Aplicar as migrations somente em Supabase staging isolado e confirmar `health=200`.
2. Publicar o build atual no projeto Vercel correto, resolvendo a política de autoria/GitHub.
3. Atualizar o webhook de uma instância de teste para o host publicado e validar `POST=202/200`, worker e recovery.
4. Executar Playwright autenticado em staging: login/lembrar dispositivo, Inbox, mensagens, mídias, realtime, IA, Dashboard e Administração.
5. Testar rajada, duplicação, ordenação, cursor, recibo de leitura, grupos e nomes de agenda.
6. Somente após evidências de staging: autorizar deploy/promote e webhook de produção.

## Gates atuais

- `npm test`: **PASS 287/287**.
- `npm run audit:release`: **PASS**.
- `npm run build`: último resultado conhecido **PASS**.
- `npm run lint`: **BLOCKED/FAIL conhecido** por timeout e dívida de formatação/`any`.
- `tsc --noEmit`: **FAIL conhecido** por tipos gerados/schema histórico.
- E2E autenticado: **NOT RUN**.
- Staging Evolution/Supabase completo: **BLOCKED**.
- Vercel oficial atualizado: **BLOCKED**.
- Release: **NO-GO**.
Atualizacao de gates em 12/10/2026: `npm test` **289/289 PASS**; `npm run audit:release` **PASS**; `npx --no-install tsc --noEmit` **PASS**; `npm run build` **PASS**. `npx eslint src scripts tests` **FAIL** com 258 problemas (252 erros, 6 avisos), principalmente `no-explicit-any`. Vercel publico continua health antigo 200, worker/cron 404 e webhook fallback 200; Supabase acessivel, mas schema externo permanece defasado. E2E autenticado e mutacoes externas continuam NOT RUN/BLOCKED.
