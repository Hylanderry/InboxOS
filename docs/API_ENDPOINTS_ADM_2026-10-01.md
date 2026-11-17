# InboxOS — Catálogo verificável de endpoints

Versão: 1º de outubro de 2026. Origem: `src/routes/api`.

**73 arquivos de rota de API / 103 contratos de método.** A presença do handler é verificada estaticamente; não significa resposta E2E comprovada.

| Endpoint | Métodos |
|---|---|
| `/api/admin/audit/` | GET |
| `/api/admin/integrations/` | GET, POST, PATCH |
| `/api/admin/integrations/rotate/` | POST |
| `/api/admin/integrations/test/` | POST |
| `/api/admin/invitations/` | GET, POST, PATCH |
| `/api/admin/me/` | GET |
| `/api/admin/members/` | GET, PATCH |
| `/api/admin/newsletter/` | GET, POST, PATCH |
| `/api/admin/newsletter/audience/` | GET, POST |
| `/api/admin/newsletter/media/` | POST |
| `/api/admin/newsletter/send/` | POST |
| `/api/admin/overview/` | GET |
| `/api/admin/system-admins/` | GET, POST |
| `/api/admin/users/` | GET, PATCH |
| `/api/admin/workspaces/` | GET, PATCH |
| `/api/agents/` | GET, POST, PATCH, DELETE |
| `/api/agents/test` | POST |
| `/api/auth/email-change/cancel` | POST |
| `/api/auth/email-change/new/start` | POST |
| `/api/auth/email-change/new/verify` | POST |
| `/api/auth/email-change/old/start` | POST |
| `/api/auth/email-change/old/verify` | POST |
| `/api/auth/login/resend` | POST |
| `/api/auth/login/start` | POST |
| `/api/auth/login/verify` | POST |
| `/api/auth/password/resend` | POST |
| `/api/auth/password/reset` | POST |
| `/api/auth/password/start` | POST |
| `/api/auth/password/verify` | POST |
| `/api/auth/phone-change/start` | POST |
| `/api/auth/phone-change/verify` | POST |
| `/api/auth/register/resend` | POST |
| `/api/auth/register/start` | POST |
| `/api/auth/register/verify` | POST |
| `/api/auth/security/` | GET, POST |
| `/api/billing/` | GET |
| `/api/chats/` | GET |
| `/api/chats/$id/ai-state` | POST |
| `/api/chats/$id/business-profile` | GET |
| `/api/chats/$id/flags` | POST |
| `/api/chats/$id/messages` | GET |
| `/api/chats/$id/read` | POST |
| `/api/chats/$phone/pause` | POST |
| `/api/chats/$phone/presence` | POST |
| `/api/chats/$phone/resume` | POST |
| `/api/chats/sync-pfp` | POST |
| `/api/company/` | GET, PATCH |
| `/api/company/logo` | POST |
| `/api/crm/` | GET, POST, PATCH, DELETE |
| `/api/crm/stages` | GET, POST, PATCH, DELETE |
| `/api/dashboard/` | GET |
| `/api/events/` | GET |
| `/api/follow-up/` | GET, POST, PATCH, DELETE |
| `/api/health` | GET |
| `/api/instances/` | GET, POST |
| `/api/instances/$name/` | DELETE |
| `/api/instances/$name/qrcode` | GET, POST |
| `/api/legal/status` | GET |
| `/api/media/$` | GET |
| `/api/media/upload` | POST |
| `/api/messages/send` | POST |
| `/api/profile/` | GET, PATCH |
| `/api/profile/avatar` | POST |
| `/api/public/webhooks/evolution` | POST |
| `/api/sync/evolution` | POST |
| `/api/sync/import` | POST |
| `/api/workspaces/` | GET, POST |
| `/api/workspaces/activate` | POST |
| `/api/workspaces/invitations/` | GET |
| `/api/workspaces/invitations/accept` | POST |
| `/api/workspaces/invitations/create` | POST |
| `/api/workspaces/invitations/revoke` | POST |
| `/api/workspaces/members/` | GET, POST |

## Limites da verificação

- Endpoints administrativos requerem System Admin e papéis globais; os controles de acesso do core permanecem separados por workspace.
- Mutação sensível deve usar `Authorization: Bearer` com token válido e sem segredo em `VITE_*`.
- `/api/background/evolution-events` é Background Function Netlify, fora do conjunto de file routes TanStack.
- Billing está desativado por padrão e o endpoint devolve 404 quando `ENABLE_BILLING` não é exatamente `true`.
- Todo endpoint ainda precisa passar por smoke test/integração real em Deploy Preview.
