# InboxOS — Checklist final de deploy

Data: 30/09/2026

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
- `GROQ_API_KEY`
- `GROQ_MODEL` opcional; default: `llama-3.3-70b-versatile`
- `SYSTEM_CRON_SECRET` / `SYSTEM_CRON_SECRET_PREVIOUS` apenas se jobs protegidos forem habilitados.

Nunca usar `VITE_` em service-role, Resend, Groq, Evolution ou `AUTH_CRYPTO_SECRET`.

## 2. Primeiro install com internet

O lockfile ainda não contém `@netlify/vite-plugin-tanstack-start@1.3.19`.

```bash
npm install
git diff -- package-lock.json
```

Revisar e versionar o lockfile. Depois usar `npm ci` em builds reproduzíveis.

## 3. Gate obrigatório de CI

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Depois iniciar a aplicação e, em outro processo:

```bash
npm run test:integration
```

Não promover tráfego real se qualquer gate falhar.

## 4. Deploy Preview Netlify

1. Configurar todas as ENV.
2. Gerar Deploy Preview.
3. `GET /api/health` deve retornar 200 / `status=ok`.
4. Cadastro PF/PJ -> OTP -> login -> challenge de device -> logout/login.
5. Recovery e troca de senha/e-mail/telefone.
6. Perfil/Empresa/Workspace/membros/convites.
7. Dashboard com mais de uma moeda para confirmar agregação separada.
8. CRM: criar/mover lead, responsável do próprio workspace e rejeição cross-workspace.
9. Follow-up: prazo local, conclusão, responsável e filtros.
10. Agente manual Groq.
11. Agente automático em conexão de teste; confirmar `automation_agent_runs`, `outbound_messages` e mensagem persistida localmente.
12. Evolution: QR, webhook, receber/enviar texto e mídia.
13. `evolution_events` deve chegar a `completed`, sem crescimento de `dead_letter`.
14. E-mails devem gerar `system_events` + `notification_deliveries`.
15. Logout/revogação de sessão deve produzir 401 no request protegido seguinte.
16. Rodar Security + Performance Advisor novamente.
17. Matriz visual: 320/360/390/430, tablet, desktop, landscape, viewport curto, safe-area e teclado móvel.

## 5. Supabase

As migrations de produto e guards já estão aplicadas no projeto vivo, incluindo:

- `20260929011845 workspace_product_modules`;
- `20260929013234 workspace_product_relational_guards`;
- `20260929013310 workspace_product_fk_indexes`;
- `20260929014139 workspace_product_runtime_guards`;
- `20260930155753 workspace_product_owner_guards`;
- `20260930160052 workspace_product_owner_index`.

Security Advisor atual: 0 lints. Performance Advisor: somente `unused_index` INFO.

**Não executar `db reset` nem reaplicar migrations antigas no projeto vivo para alinhar nomes/timestamps.**

## 6. Billing

A fundação e o estado de billing estão programados. Antes de aceitar dinheiro ainda é uma decisão externa definir:

- provedor;
- planos/preços;
- trial;
- renovação/cancelamento;
- inadimplência;
- webhook financeiro;
- política fiscal/comercial.

Só depois deve ser adicionado o adapter de checkout/provedor, preservando authorization/workspace já existentes.
