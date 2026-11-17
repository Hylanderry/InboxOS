# InboxOS — handoff mínimo e econômico após Fase 10 (02/10/2026)

**ÚNICA base válida:** `inboxos-fase10-recibos-health-2026-10-02.zip`.

**Contexto essencial:** InboxOS SaaS multi-tenant de WhatsApp com Evolution API, Supabase Auth/DB, Netlify TanStack Start, Groq, Resend, ADM global. Billing OFF por `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`. Foram implementadas Fases 1–10, inclusive autenticação/OTP, cofre/ADM, newsletter, callbacks assinados, recovery cron, proteção de webhooks, recibos de mensagens e diagnóstico de saúde. `npm test`: 166/166; auditoria estática OK exceto lockfile. **Nada disso prova E2E nem produção.** Não reanalisar os relatórios históricos.

## Somente 5 gates necessários (execução sequencial)

1. **G1 build, primeiro e bloqueador** — em ambiente Node >=22.12 com registry npm funcionando: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund && npm ci --include=dev --include=optional --no-audit --no-fund && npm test && npm run audit:release && npm run lint && npx --no-install tsc --noEmit && npm run build`. Corrigir os erros reais, não forjar versões/integridades e não afrouxar gates. Há 6 divergências no package-lock, incluindo `@netlify/vite-plugin-tanstack-start` não resolvido. Se DNS não funcionar, registrar BLOCKED, sem repetir tentativas custosas.
2. **G2 banco em staging** — comparar migrations locais/remotas e ensaiar em banco **isolado**, testar last owner/superadmin, sessões, RLS e tenants. Não executar DDL/reset no projeto vivo. A migration local `20261001230000_protect_last_privileged_members.sql` ainda não constava no histórico remoto da última consulta. Reconstruir o histórico antigo para criação do zero.
3. **G3 API autenticada** — testar os contratos HTTP reais com contas sintéticas e papéis diferentes: autenticação/OTP, multi-tenant, 401/403/409/429, concorrência, mensagens, recibos de status e erros do worker.
4. **G4 integrações em sandbox** — Evolution isolada (QR, mensagens, status DELIVERED→READ, mídia, webhook, retries, cron), Resend (contas/testes consentidos), Groq; confirmar que o preview não altera o webhook real e que a fila não duplica callbacks. Nada de clientes, contatos ou listas reais.
5. **G5 preview e promoção** — CI Netlify/GitHub verde, navegador mobile/desktop, variáveis server-only, logs/monitoramento, backup/rollback; agendamento Netlify em site staging publicado. Só promover produção após todos P0 PASS e **aprovação explícita do proprietário**.

**Economia:** execute G1 e somente se PASS avance G2–G5. Documente PASS/FAIL/BLOCKED e evidência de cada bloqueio, concentre eventuais autorizações em um único pedido. Não comprar serviços, não modificar credenciais produtivas, não enviar mensagens/e-mails para contatos reais e não publicar sem autorização. Entregar ZIP atualizado, lockfile real, e relatório enxuto dos gates. O Work não precisa ler os ~100 KB de handoffs históricos a menos que um erro concreto exija isso.
