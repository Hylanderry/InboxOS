# INBOXOS FASE 16 — RELATÓRIO MESTRE DE AUDITORIA PLAYWRIGHT (E2E & NETWORK)

**Data e Hora:** 11/10/2026, 21:58:16
**Usuário Autenticado:** `ackleynicolas@gmail.com` (`superadmin`)
**Servidor em Execução:** `http://localhost:3000`

## 1. RESUMO GERAL

| Métrica                         | Resultado                 |
| ------------------------------- | ------------------------- |
| Páginas Públicas / Auth         | 9 / 9 **PASS** (100%)     |
| Telas / Views da Aplicação      | 8 / 8 **PASS**            |
| Endpoints de API / Funções      | 20 / 20 **PASS (200 OK)** |
| Requisições de Rede Monitoradas | 1490 requisições          |
| Erros Críticos de Execução      | 0 erros críticos          |

## 2. PÁGINAS TESTADAS

| Página             | Rota                    | Status HTTP | Latência (ms) | Resultado |
| ------------------ | ----------------------- | ----------- | ------------- | --------- |
| Login              | `/auth/login`           | 200         | 1456ms        | **PASS**  |
| Register           | `/auth/register`        | 200         | 1664ms        | **PASS**  |
| ForgotPassword     | `/auth/forgot-password` | 200         | 1101ms        | **PASS**  |
| LegalTerms         | `/legal/terms`          | 200         | 1076ms        | **PASS**  |
| LegalPrivacy       | `/legal/privacy`        | 200         | 1071ms        | **PASS**  |
| LegalCookies       | `/legal/cookies`        | 200         | 1063ms        | **PASS**  |
| LegalAcceptableUse | `/legal/acceptable-use` | 200         | 1075ms        | **PASS**  |
| LegalPayments      | `/legal/payments`       | 200         | 1073ms        | **PASS**  |
| MainShell          | `/`                     | 200         | 2599ms        | **PASS**  |

## 3. TELAS E SUB-OPÇÕES DO SISTEMA (VIEWS)

| Módulo        | View            | Status   | Latência de Troca |
| ------------- | --------------- | -------- | ----------------- |
| Dashboard     | `dashboard`     | **PASS** | 1343ms            |
| CRM           | `crm`           | **PASS** | 1297ms            |
| Follow-up     | `follow-up`     | **PASS** | 1311ms            |
| Conexões      | `conexoes`      | **PASS** | 1270ms            |
| Agentes       | `agentes`       | **PASS** | 1314ms            |
| Configurações | `configuracoes` | **PASS** | 1343ms            |
| ADM global    | `admin`         | **PASS** | 1298ms            |
| Inbox         | `inbox`         | **PASS** | 1325ms            |

## 4. AUDITORIA DE ENDPOINTS (API & FUNCTIONS)

| Método | Rota                                                                  | Status HTTP | Latência | Payload Resumido                                     |
| ------ | --------------------------------------------------------------------- | ----------- | -------- | ---------------------------------------------------- |
| GET    | `/api/health`                                                         | **200**     | 134ms    | `{"status":"ok","database":"reachable","latencyMs":` |
| GET    | `/api/legal/status`                                                   | **200**     | 663ms    | `{"documents":[{"id":"579ce3bb-b93a-473a-87fd-4db17` |
| GET    | `/api/auth/security`                                                  | **200**     | 562ms    | `{"currentSessionId":"22f4a364-c2ad-4f40-9703-5e612` |
| GET    | `/api/admin/overview`                                                 | **200**     | 674ms    | `{"metrics":{"workspaces":2,"instances":0,"crmLeads` |
| GET    | `/api/admin/users`                                                    | **200**     | 1049ms   | `{"users":[{"id":"a9546f10-039c-4106-8135-ccca1ae87` |
| GET    | `/api/admin/workspaces`                                               | **200**     | 653ms    | `{"workspaces":[{"id":"5c8802f2-76a0-4b6c-9e9b-56f0` |
| GET    | `/api/admin/members?workspaceId=5c8802f2-76a0-4b6c-9e9b-56f07681e261` | **200**     | 753ms    | `{"members":[{"id":"4d6487c3-ebbe-493f-ae5d-1b78308` |
| GET    | `/api/admin/integrations`                                             | **200**     | 779ms    | `{"integrations":[{"id":"0d8cbd6a-e29e-44fd-82bb-42` |
| GET    | `/api/admin/system-admins`                                            | **200**     | 659ms    | `{"admins":[{"user_id":"a9546f10-039c-4106-8135-ccc` |
| GET    | `/api/admin/audit`                                                    | **200**     | 651ms    | `{"entries":[]}`                                     |
| GET    | `/api/admin/newsletter`                                               | **200**     | 899ms    | `{"campaigns":[]}`                                   |
| GET    | `/api/admin/newsletter/audience`                                      | **200**     | 1220ms   | `{"segments":{"object":"list","has_more":false,"dat` |
| GET    | `/api/workspaces`                                                     | **200**     | 767ms    | `{"workspaces":[{"id":"00000000-0000-0000-0000-0000` |
| GET    | `/api/chats`                                                          | **200**     | 878ms    | `{"chats":[],"hasMore":false,"nextCursor":null}`     |
| GET    | `/api/crm`                                                            | **200**     | 1014ms   | `{"stages":[{"id":"c5dac851-5d83-4e8d-892c-3287cd48` |
| GET    | `/api/crm/stages`                                                     | **200**     | 870ms    | `{"stages":[{"id":"c5dac851-5d83-4e8d-892c-3287cd48` |
| GET    | `/api/dashboard`                                                      | **200**     | 975ms    | `{"metrics":{"connectedInstances":0,"totalInstances` |
| GET    | `/api/follow-up`                                                      | **200**     | 890ms    | `{"tasks":[],"canManage":true}`                      |
| GET    | `/api/agents`                                                         | **200**     | 1072ms   | `{"agents":[],"instances":[],"runs":[],"groqConfigu` |
| GET    | `/api/profile`                                                        | **200**     | 541ms    | `{"profile":{"user_id":"a9546f10-039c-4106-8135-ccc` |

## 5. EVIDÊNCIAS VISUAIS GERADAS (SCREENSHOTS)

Todos os screenshots foram gerados em `tests/e2e-artifacts/screenshots/`:

- **Autenticação:** `login.png`, `register.png`, `forgotpassword.png`
- **Termos e Legal:** `legalterms.png`, `legalprivacy.png`, `legalcookies.png`, `legalacceptableuse.png`, `legalpayments.png`
- **Shell e Módulos:** `mainshell.png`, `view_dashboard.png`, `view_crm.png`, `view_inbox.png`, `view_follow_up.png`, `view_conexoes.png`, `view_agentes.png`, `view_configuracoes.png`
- **ADM Global (Todas as Abas):** `system_admin_visao_geral.png`, `system_admin_usuarios.png`, `system_admin_workspaces.png`, `system_admin_apikeys.png`, `system_admin_newsletter.png`, `system_admin_auditoria.png`, `system_admin_system_admins.png`, `system_admin_light_mode.png`
- **Configurações:** `settings_perfil.png`, `settings_organizacao.png`, `settings_membros.png`, `settings_conexoes_whatsapp.png`
- **Responsividade (6 Larguras):** 320px, 360px, 390px, 768px, 1024px, 1440px.
