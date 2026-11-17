# InboxOS — handoff mínimo Fase 9 para Work

**ÚNICA base:** `inboxos-fase9-webhook-2026-10-02.zip`. **Não usar versões anteriores.** Objetivo: comprovar gates que este ambiente não consegue executar, sem refazer as 155 verificações locais nem gastar com infraestrutura desnecessária. Billing OFF. Consultar `docs/FASE9_WEBHOOK_SEGURANCA_2026-10-02.md` somente se houver dúvida.

## 5 gates restantes para liberar produção

**G1 — Build (primeiro, bloqueador):** com Node >=22.12 e npm com internet, em branch privada:
```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --include=dev --include=optional --no-audit --no-fund
npm test && npm run audit:release && npm run lint && npx --no-install tsc --noEmit && npm run build
```
Corrigir erros REAIS dos logs. Lock antigo possui 6 divergências, principalmente plugin `@netlify/vite-plugin-tanstack-start`. Não fabricar integridades nem desligar lint. Se falhar npm por DNS, declarar BLOCKED uma vez; não insistir.

**G2 — Banco STAGING:** comparar migrations locais vs. histórico do projeto Supabase atual **somente leitura**. Local tem `20261001230000_protect_last_privileged_members.sql` que não consta no histórico vivo. Há outras migrations remotas legadas não presentes localmente. Reconstituir estado em banco isolado, testar RLS, dois tenants, sessão, OTP e concorrência de último owner/superadmin. **Não executar DDL/reset/migrations no projeto real.**

**G3 — APIs autenticadas:** staging com contas sintéticas de papéis distintos; testar HTTP 401/403/409/429/503, convites, sessões, mudança de e-mail/telefone, filas e 103 contratos da matriz. Guardar evidências PASS/FAIL/BLOCKED.

**G4 — Sandbox integrações:** Evolution (QR, mensagens, grupos, mídias, retries, jobs, cron), Resend (OTP e campanha somente para destinatários de teste consentidos, opt-out, falha temporária), Groq (agente de teste, respostas duplicadas). **Proibido usar contatos, instâncias ou listas reais.** Em Deploy Preview o código bloqueia configuração remota de webhook sem `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=true` **e instância sandbox exclusiva**. Nunca habilitar essa flag com credenciais produtivas.

**G5 — Deploy Preview / publicação:** testar Netlify Preview com `CONTEXT=deploy-preview`, `DEPLOY_PRIME_URL` de `*.netlify.app`, ENV server-only, UX 320/360/390px/tablet/desktop, logs e rollback. CI tem que passar. Scheduled Functions exigem site staging publicado separado para comprovação do cron. Produção somente depois de backup, gates P0 PASS e **aprovação explícita do proprietário**.

## Regra de economia

Faça G1 primeiro. Se G1 falhar, conserte-o antes de expandir o restante. Não releia relatórios históricos nem recrie funcionalidades já implementadas. Não comprar serviços, rodar envs pagos, enviar mensagens/e-mails externos, alterar credenciais, DNS, webhooks produtivos ou dados de produção. Agrupar todos os acessos indispensáveis numa única solicitação. Entregar um ZIP final, patch e relatório enxuto com os comandos/resultados reais. Não chamar testes locais de homologação.
