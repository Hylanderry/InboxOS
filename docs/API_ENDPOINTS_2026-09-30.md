# InboxOS — Catálogo de Endpoints

Atualizado em 30/09/2026. Este catálogo corresponde às 58 rotas HTTP `createFileRoute()` presentes em `src/routes/api`, além da Background Function interna da Evolution.

## Convenções de autenticação

- **Público:** não exige sessão de usuário, mas continua sujeito a validação de origem/rate-limit quando aplicável.
- **Sessão:** exige `Authorization: Bearer <Supabase access token>` e uma `user_sessions` ativa correspondente ao `session_id` do JWT.
- **Workspace:** além da sessão, exige `x-workspace-id: <uuid>`. O header seleciona contexto; a autorização é sempre validada contra `workspace_members.status = active` no servidor.
- **Webhook:** exige `x-webhook-token`, `apikey` ou `?token=` compatível com `EVOLUTION_WEBHOOK_TOKEN`/`EVOLUTION_API_KEY`; o `workspace_id` nunca é aceito do payload como fonte de verdade.
- Mutações protegidas usam rate-limit server-side por usuário/IP (`consume_auth_rate_limit`). O webhook tem rate-limit próprio no banco.

## Auth — cadastro

| Método | Endpoint | Acesso | Entrada principal | Função |
|---|---|---|---|---|
| POST | `/api/auth/register/start` | Público | `accountKind`, nome/empresa, `email`, `countryCode`, `phone`, `password`, aceites legais; opcional `invitationId` + `invitationToken`; header `x-device-token` recomendado | Valida, cria pending registration + challenge OTP e envia código via Resend auditado |
| POST | `/api/auth/register/verify` | Público | `challengeId`, `code` | Confirma OTP, confirma Auth, provisiona perfil/workspace/membership/aceites e histórico de senha |
| POST | `/api/auth/register/resend` | Público | `challengeId`; header `x-device-token` recomendado | Reenvia OTP com cooldown de 60s, limite 5 e bloqueio/rate-limit |

Cadastro PJ valida CNPJ matematicamente. Cadastro PF exige nome e sobrenome. Telefone é persistido em E.164.

## Auth — login e dispositivo confiável

| Método | Endpoint | Acesso | Entrada principal | Função |
|---|---|---|---|---|
| POST | `/api/auth/login/start` | Público | `email`, `password`, `deviceToken`, `rememberDevice` | Autentica; dispositivo confiável entra direto, desconhecido recebe OTP |
| POST | `/api/auth/login/verify` | Público | `email`, `password`, `deviceToken`, `rememberDevice`, `challengeId`, `code` | Confirma dispositivo, opcionalmente confia por 90 dias e cria `user_sessions` revogável |
| POST | `/api/auth/login/resend` | Público | mesmos dados do login + `challengeId` | Reenvia OTP do dispositivo, validando credenciais e o mesmo device token |

## Auth — recuperação de senha

A resposta inicial é anti-enumeração: não revela se o e-mail existe.

| Método | Endpoint | Acesso | Entrada principal | Função |
|---|---|---|---|---|
| POST | `/api/auth/password/start` | Público | `email` | Cria challenge opaco e envia OTP apenas quando a conta confirmada existe |
| POST | `/api/auth/password/resend` | Público | `challengeId` | Reenvio anti-enumeração com cooldown/limite |
| POST | `/api/auth/password/verify` | Público | `challengeId`, `code` | Entrega grant curto após OTP válido |
| POST | `/api/auth/password/reset` | Grant de recovery | `challengeId`, `grantToken`, `newPassword`, `revokeOtherSessions` | Impede reutilizar as 3 últimas senhas, troca senha e pode revogar sessões |

## Auth — segurança, e-mail e telefone

| Método | Endpoint | Acesso | Entrada principal | Função |
|---|---|---|---|---|
| GET | `/api/auth/security/` | Sessão | — | Lista sessões e dispositivos do usuário atual |
| POST | `/api/auth/security/` | Sessão | `action`, opcional `targetId` | `revoke_others`, `revoke_session`, `untrust_device`, `revoke_device` |
| POST | `/api/auth/email-change/old/start` | Sessão | — | Envia OTP para o e-mail atual |
| POST | `/api/auth/email-change/old/verify` | Sessão | `challengeId`, `code` | Gera grant da primeira fase |
| POST | `/api/auth/email-change/new/start` | Sessão | `oldChallengeId`, `grantToken`, `newEmail` | Envia OTP para o novo e-mail |
| POST | `/api/auth/email-change/new/verify` | Sessão | `newChallengeId`, `code` | Só então altera Auth + profile, registra evento e avisa e-mail antigo |
| POST | `/api/auth/email-change/cancel` | Sessão | — | Consome/cancela challenges abertos de troca de e-mail |
| POST | `/api/auth/phone-change/start` | Sessão | `countryCode`, `phone` | Normaliza E.164 e envia challenge ao e-mail autenticado |
| POST | `/api/auth/phone-change/verify` | Sessão | `challengeId`, `code` | Persiste novo telefone somente depois do OTP |

## Perfil, empresa e documentos legais

| Método | Endpoint | Acesso | Workspace | Função |
|---|---|---|---|---|
| GET | `/api/profile/` | Sessão | Não | Lê perfil pessoal |
| PATCH | `/api/profile/` | Sessão | Não | Atualiza nome/telefone; não aceita `user_id`, `workspace_id` ou role |
| POST | `/api/profile/avatar` | Sessão | Não | Upload JPG/PNG/WEBP até 4 MB no bucket privado `profile-media` |
| GET | `/api/company/` | Sessão | Sim | Lê perfil empresarial do workspace |
| PATCH | `/api/company/` | `workspace.manage` | Sim | Cria/atualiza razão social, fantasia, CNPJ e telefone |
| POST | `/api/company/logo` | `workspace.manage` | Sim | Upload de logo do workspace no bucket privado |
| GET | `/api/legal/status` | Sessão | Não | Lista versões legais ativas e `acceptedAt` do usuário |

## Workspaces, membros e convites

| Método | Endpoint | Acesso | Workspace | Função |
|---|---|---|---|---|
| GET | `/api/workspaces/` | Sessão | Não | Lista memberships ativas e `activeWorkspaceId` da app session |
| POST | `/api/workspaces/` | Sessão | Não | Cria workspace e membership `owner` |
| POST | `/api/workspaces/activate` | Sessão | Sim | Persiste `last_workspace_id` na sessão atual |
| GET | `/api/workspaces/members/` | `members.read` | Sim | Lista membros + perfil básico |
| POST | `/api/workspaces/members/` | `members.manage` | Sim | `set_role`, `suspend`, `activate`, `remove` com guards de owner/admin |
| GET | `/api/workspaces/invitations/` | `members.read` | Sim | Lista convites do workspace |
| POST | `/api/workspaces/invitations/create` | `members.manage` | Sim | Cria token hash, validade 7 dias e envia convite por Resend |
| POST | `/api/workspaces/invitations/revoke` | `members.manage` | Sim | Revoga convite pendente |
| POST | `/api/workspaces/invitations/accept` | Sessão | Não | Valida token/e-mail/expiração e cria membership; rollback se aceite não concluir |

Papéis: `owner`, `admin`, `agent`. `owner` tem todas as permissões; `admin` não possui `billing.manage`; `agent` tem leitura operacional e `messages.send`, sem gestão de membros/workspace.

## Inbox / chats

Todos os endpoints abaixo exigem sessão + `x-workspace-id`. Recursos são resolvidos dentro do workspace autenticado.

| Método | Endpoint | Função |
|---|---|---|
| GET | `/api/chats/` | Lista chats do workspace |
| GET | `/api/chats/$id/messages` | Lista mensagens do chat |
| GET | `/api/chats/$id/business-profile` | Obtém perfil comercial associado ao chat |
| POST | `/api/chats/$id/read` | Marca leitura e trata read receipt |
| POST | `/api/chats/$id/flags` | Atualiza flags operacionais do chat |
| POST | `/api/chats/$id/ai-state` | Altera estado de IA/pausa do chat |
| POST | `/api/chats/$phone/pause` | Pausa automação/IA para contato legado por telefone |
| POST | `/api/chats/$phone/resume` | Retoma automação/IA |
| POST | `/api/chats/$phone/presence` | Solicita/atualiza presença via instância pertencente ao workspace |
| POST | `/api/chats/sync-pfp` | Sincroniza fotos de perfil |
| GET | `/api/events/` | Transporta eventos/realtime server-mediated e presença |

## Instâncias Evolution

| Método | Endpoint | Acesso | Função |
|---|---|---|---|
| GET | `/api/instances/` | Workspace | Lista instâncias pertencentes ao workspace |
| POST | `/api/instances/` | Workspace | Cria/registra instância e ownership |
| DELETE | `/api/instances/$name/` | Workspace | Remove instância pertencente ao workspace |
| GET | `/api/instances/$name/qrcode` | Workspace | Lê estado/QR da instância |
| POST | `/api/instances/$name/qrcode` | Workspace | Cria/reconecta/configura fluxo QR conforme ação enviada |
| POST | `/api/sync/evolution` | Workspace | Dispara sincronização controlada com Evolution |
| POST | `/api/sync/import` | Workspace | Importa/reconcilia dados remotos com ownership explícito |

## Mensagens e mídia

| Método | Endpoint | Acesso | Função |
|---|---|---|---|
| POST | `/api/media/upload` | Workspace | Autoriza upload de mídia em path tenant-scoped e entrega token de upload assinado |
| GET | `/api/media/$` | Workspace | Resolve/download de mídia privada com autorização |
| POST | `/api/messages/send` | Workspace | Envia texto/mídia pela instância resolvida, persiste outbound/optimistic state e contexto de tenant |

O browser pode usar `uploadToSignedUrl` somente depois de `/api/media/upload`; o bucket privado não é aberto publicamente.

## Produto — Dashboard, CRM, Follow-up, Agentes e Billing

Todos os endpoints abaixo exigem sessão ativa + `x-workspace-id`. As tabelas destes módulos não são expostas diretamente ao browser; o backend usa service role após validar membership/permissão.

| Método | Endpoint | Permissão | Função |
|---|---|---|---|
| GET | `/api/dashboard/` | `workspace.read` | Métricas reais de conexões, chats, não lidas, mensagens 24h, CRM, follow-ups e agentes |
| GET | `/api/crm/` | `crm.read` | Lista pipeline/etapas/leads e informa se a role atual pode gerenciar |
| POST | `/api/crm/` | `crm.manage` | Cria lead; valida stage/chat/contact e responsável ativo no mesmo workspace |
| PATCH | `/api/crm/` | `crm.manage` | Atualiza lead, responsável e etapa com guards de tenant/membership ativa |
| DELETE | `/api/crm/?id=...` | `crm.manage` | Exclui lead do workspace |
| GET | `/api/crm/stages` | `crm.read` | Lista etapas; cria pipeline padrão no primeiro uso quando necessário |
| POST | `/api/crm/stages` | `crm.manage` | Cria etapa |
| PATCH | `/api/crm/stages` | `crm.manage` | Atualiza etapa |
| DELETE | `/api/crm/stages?id=...` | `crm.manage` | Exclui etapa somente quando não está em uso |
| GET | `/api/follow-up/` | `crm.read` | Lista tarefas/follow-ups do workspace |
| POST | `/api/follow-up/` | `crm.manage` | Cria follow-up ligado opcionalmente a lead/chat e responsável ativo do workspace |
| PATCH | `/api/follow-up/` | `crm.manage` | Atualiza prazo, status, prioridade, vínculo, responsável ativo e conclusão |
| DELETE | `/api/follow-up/?id=...` | `crm.manage` | Exclui follow-up |
| GET | `/api/agents/` | `agents.manage` | Lista agentes, conexões e execuções recentes; informa se Groq está configurado |
| POST | `/api/agents/` | `agents.manage` | Cria agente Groq manual/automático, global ou por conexão |
| PATCH | `/api/agents/` | `agents.manage` | Atualiza modelo, prompt, escopo, modo, grupos, temperatura/tokens e estado |
| DELETE | `/api/agents/?id=...` | `agents.manage` | Exclui agente |
| POST | `/api/agents/test` | `agents.manage` | Executa teste real no Groq e audita `automation_agent_runs` |
| GET | `/api/billing/` | `billing.read` | Lê o estado persistido de assinatura/plano/provedor do workspace |

### Agentes automáticos

O webhook dispara automação somente depois da persistência idempotente de uma nova mensagem recebida. A saída automática passa por `outbound_messages` e depois é persistida localmente no InboxOS, mantendo trilha de auditoria sem simular takeover humano. `fromMe`, replay/duplicata, chat com `ai_paused`, conexão fechada e grupos não autorizados são ignorados. O banco possui unicidade por `agent + trigger_message`, além de permitir no máximo um agente automático global e um por conexão no mesmo workspace.

### Billing

Existe backend e tabela `workspace_billing` com status, plano, período, customer/subscription IDs e metadados. **Não existe checkout fictício**: criação de cobrança, webhooks financeiros e alteração de assinatura dependem da escolha explícita do provedor e das regras comerciais.

## Evolution webhook / background

| Método | Endpoint | Acesso | Função |
|---|---|---|---|
| POST | `/api/public/webhooks/evolution` | Webhook secret | Normaliza evento, resolve `instance_name` para `whatsapp_instances`, grava `evolution_events` idempotente e despacha processamento |
| POST | `/api/background/evolution-events` | Assinatura HMAC interna | **Netlify Background Function**, não é rota TanStack pública de aplicação; consome `eventId`, processa/reencadeia fases duráveis |

O webhook nunca confia em `workspace_id` recebido do provedor. O workspace é lido da instância previamente cadastrada. Em Netlify, eventos pesados vão para a Background Function; Cloudflare Queue permanece apenas como compatibilidade quando o binding existir; sem ambos, o consumidor durável roda inline.

## Health

| Método | Endpoint | Acesso | Função |
|---|---|---|---|
| GET | `/api/health` | Público | Verifica reachability do banco |
| GET | `/api/health?detailed=true` | Workspace | Inclui contagem contextual de instâncias |

## Status HTTP importante

- `200/201/202`: sucesso/criação/aceito para processamento.
- `400`: payload/contexto explícito inválido.
- `401`: token/sessão de aplicação ausente, inválida ou revogada.
- `403`: membership/role/permissão insuficiente.
- `404`: recurso ou instância não pertencente ao contexto atual.
- `409`: conflito em operação atômica de convite/provisionamento.
- `429`: rate-limit/cooldown.
- `500/502/503`: erro de backend, upstream Evolution ou saúde degradada.
