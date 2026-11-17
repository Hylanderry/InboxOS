# Functions ADM — InboxOS

Esta pasta documenta o control plane administrativo do InboxOS. Ela é deliberadamente separada da documentação de produto: alterações aqui devem ser revisadas como mudanças de segurança, autorização ou operação, e não como simples ajustes de interface.

## O que existe hoje

- A área administrativa está disponível em `/admin`, separada visualmente do workspace.
- A entrada é validada no cliente apenas para redirecionamento; a autorização real continua em `requireSystemAdmin()` no servidor.
- Todas as rotas `/api/admin/*` usam `requireSystemAdmin()` e respondem `Cache-Control: no-store`.
- O cliente nunca recebe `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, `INTEGRATION_VAULT_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`, `GROQ_API_KEY` ou `RESEND_API_KEY`.
- O acesso ao banco administrativo usa o cliente service-role somente dentro do servidor. As tabelas de controle revogam acesso a `anon` e `authenticated` e mantêm política exclusiva para `service_role`.
- Não há Supabase Edge Functions neste repositório. O runtime atual é composto por rotas server/Nitro implantadas na Vercel; criar uma Edge Function exige um projeto, segredo e pipeline separados.

## Regras que não podem ser quebradas

1. Nunca colocar segredo em `VITE_*`, no bundle, no HTML ou em respostas de API.
2. Nunca confiar em `role` vindo do navegador, em `user_metadata` ou em e-mail sem confirmação para conceder System Admin.
3. Convites carregam apenas um hash do token. O funcionário define a própria senha depois de confirmar o e-mail; um administrador não deve visualizar nem armazenar senha de funcionário.
4. Qualquer mutação administrativa deve validar Zod, registrar auditoria e manter a proteção do último owner/superadmin.
5. Billing só pode ser ativado depois de provedor, planos, webhook assinado, idempotência e testes de entitlement estarem prontos. Hoje ele permanece OFF por desenho.

## Ordem segura de evolução

1. Aplicar e auditar RLS no ambiente de staging.
2. Validar `/api/admin/me/` como não autenticado, usuário comum e System Admin.
3. Testar convites com endereço controlado, sem criar conta de produção.
4. Testar newsletter em modo rascunho; envio exige confirmação literal e nunca deve ocorrer em QA.
5. Só depois adicionar granularidade de permissões por workspace e billing.

Veja `SECURITY_AUDIT.md`, `ADMIN_BACKLOG.md` e `rls-audit.sql` antes de qualquer migration nova.
