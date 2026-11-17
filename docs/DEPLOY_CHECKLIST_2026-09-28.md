# InboxOS — Checklist final de deploy

## 1. Variáveis Netlify

Browser/build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_CRYPTO_SECRET` (>= 32 caracteres aleatórios)
- `PUBLIC_APP_URL`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_TOKEN`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `GROQ_API_KEY` para teste/resposta automática de agentes
- `GROQ_MODEL` opcional; default do código: `llama-3.3-70b-versatile`
- `SYSTEM_CRON_SECRET`/`SYSTEM_CRON_SECRET_PREVIOUS` apenas se jobs protegidos forem usados.

Nunca usar prefixo `VITE_` em service role, Resend, Groq, Evolution ou `AUTH_CRYPTO_SECRET`.

## 2. Primeiro install com internet

O lockfile herdado ainda não inclui o plugin Netlify fixado no `package.json`.

```bash
npm install
git diff -- package-lock.json
```

Revisar e versionar o lockfile. Nos builds seguintes usar `npm ci`.

## 3. Gate obrigatório

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run dev
# outro terminal
npm run test:integration
```

Não promover tráfego real se qualquer comando falhar.

## 4. Deploy Preview Netlify

1. Configurar ENV.
2. Deploy Preview.
3. `GET /api/health` -> 200 / `status=ok`.
4. Validar cadastro PF/PJ -> OTP -> login -> device challenge -> logout/login.
5. Recovery e troca de senha/e-mail/telefone.
6. Perfil, Empresa, Workspace, membros e convites.
7. Dashboard/CRM/Follow-up com dados de teste.
8. Agente manual Groq; depois agente automático em uma conexão de teste.
9. Conectar Evolution, QR, webhook, receber/enviar texto/mídia.
10. Confirmar `evolution_events` chegando a `completed` e sem crescimento de `dead_letter`.
11. Confirmar `system_events` + `notification_deliveries` nos e-mails.
12. Verificar logout/revogação de sessão em outro request.
13. Rodar Security/Performance Advisor novamente.
14. Fazer matriz visual em 320/360/390/430, tablet, desktop, landscape, viewport curto, safe-area e teclado móvel.

## 5. Supabase

As migrations de 27/29 desta entrega já estão aplicadas no projeto vivo. Não executar `db reset` nem reaplicar o histórico antigo para “sincronizar nomes”. Ver `docs/reconciliation/SUPABASE_FINAL_STATE_2026-09-28.md`.

## 6. Billing

O estado de billing está programado. Antes de aceitar pagamentos ainda é obrigatório decidir externamente:

- provedor;
- planos e preços;
- trial;
- renovação/cancelamento;
- inadimplência;
- webhooks financeiros;
- política fiscal/comercial.

Depois dessa decisão, implementar o adapter específico sem alterar o modelo de tenant/authorization já criado.
