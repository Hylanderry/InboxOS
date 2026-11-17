# InboxOS

Painel multi-tenant de atendimento/vendas por WhatsApp — TanStack Start + Vite + React (shadcn/Tailwind), Supabase, Evolution API v2, Groq, Resend. Deploy exclusivo na Vercel (projeto `inbox_os`).

## Comandos
- `npm run dev` — dev local (carrega `.env`, que aponta para staging/preview)
- `npm test` — suíte Node (`node --test`), deve ficar 100% verde
- `npm run lint` / `npm run build`

## Ambientes
- `.env` → staging/preview (padrão do dev local)
- `.env.production.local` → valores reais de PRODUÇÃO. Não usar para dev nem testes.
- Nunca commitar arquivos `.env*` (exceto `.env.example`).

## Skills do projeto
Em `.claude/skills/` (espelhadas de `.agents/skills/`, usadas pelo Codex):
- `inboxos-backend-release` — backend, Supabase staging, RLS, Evolution, gates de produção
- `inboxos-premium-uiux` — qualquer mudança visual (React, CSS, componentes)
- `inboxos-legal-consent-flow` — cadastro, termos/privacidade, consentimento

## Regras do projeto
@.agents/rules/supabase-production-safety.md
@.agents/rules/evolution-staging.md
@.agents/rules/inboxos-uiux-consistency.md
