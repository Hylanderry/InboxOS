# InboxOS — Handoff mínimo para ChatGPT Work (Fase 7, 02/10/2026)

**ÚNICO CÓDIGO-BASE:** `inboxos-fase7-origin-retry-2026-10-02.zip`. Não misture ZIPs anteriores. Mantenha Billing OFF (`ENABLE_BILLING=false`, `VITE_ENABLE_BILLING=false`) e não introduza novos provedores ou mudanças visuais sem erro reproduzido.

## Contexto para evitar gastar créditos

InboxOS: SaaS multi-tenant de atendimento WhatsApp, React/TanStack Start, Node/TypeScript, Netlify, Supabase, Evolution, Groq e Resend; inbox, CRM, IA, ADM global, newsletter. Histórico Fases 1–7 está no projeto, mas NÃO precisa ser relido. A Fase 7 reforçou validação de URLs de chamadas internas/convites (inclusive ADM global) e backoff da fila Evolution. Recuperação periódica foi adicionada na Fase 6. `INTEGRATION_VAULT_KEY` é a chave do cofre correta nesta variante. ADM global separado de papéis locais. Não reescrever autenticação, fila, cofre ou UI por iniciativa própria.

**Começar apenas por:** `package.json`, `package-lock.json`, `scripts/prepare-production-build.sh`, `docs/FASE7_ORIGENS_E_RETRY_2026-10-02.md`, `docs/QA_EVIDENCIAS_RELEASE.md`. Para falhas concretas, abrir apenas os arquivos envolvidos.

## Só o que não pode ser comprovado neste executor

### 1) Destravar build/CI (primeira ação, P0)

Num executor Node 22.16.0 / npm 10.9.2 com acesso ao registry oficial, executar **uma vez** `bash scripts/prepare-production-build.sh`. Esse script regenera o lockfile real, instala pacotes, roda testes, auditoria, ESLint, typecheck e Vite build. O lock atual tem **6 divergências**; falta `@netlify/vite-plugin-tanstack-start@1.3.19`, e este executor recebe `EAI_AGAIN`. Não fabricar integridade SHA e não desativar gates; corrigir somente os diagnósticos reais. Registrar exit codes e diff de lock. Se o registry não estiver acessível, marcar BLOCKED uma vez e seguir sem novas tentativas.

### 2) Banco e jobs em staging isolado (P0)

**Jamais fazer `db reset`, `db push` ou aplicar migrations às cegas no Supabase vivo.** Criar/reutilizar projeto STAGING com dados sintéticos. Reconciliar migrations históricas e testar a proteção transacional do último owner/superadmin, transferência de owner, usuários suspensos, sessões revogadas e RLS em dois tenants. Depois testar fila `evolution_events` com dois workers simultâneos, falhas de rede, status `queued/processing/failed/dead_letter`, recuperação e contagem de `attempts`; testar especificamente que `next_attempt_at` futuro impede execução. A Scheduled Function exige um site de staging publicado; Deploy Previews não disparam cron automaticamente. Ativar `ENABLE_EVOLUTION_RECOVERY=true` **somente** em staging e usar Run now. Não usar contatos reais.

### 3) Preview e integrações (P0/P1)

Num Deploy Preview Netlify separado, verificar `CONTEXT=deploy-preview` com `DEPLOY_PRIME_URL=https://<preview>.netlify.app` e `PUBLIC_APP_URL` do projeto principal. **Nenhum link de convite ou requisição interna pode apontar a produção.** Executar smoke HTTP de autenticação, RBAC/401/403/409/429/503, convites, sessōes, dois tenants e flows de Evolution/Groq/Resend com contas sandbox e destinatários consentidos. Testar mobile (320/360/390 px), desktop e formulários. Rodar `npm run test:integration` contra `TEST_BASE_URL` do preview e completar `docs/QA_EVIDENCIAS_RELEASE.md` com PASS/FAIL/BLOCKED.

### 4) Liberação final (não automática)

Se e somente se 1–3 estiverem PASS, documentar backup, rollback, observabilidade e gates de ENV. Billing continua OFF, bootstrap de superadmin deve estar encerrado. Pedir **aprovação explícita do proprietário** antes de migrar banco vivo, mexer em webhooks reais, mandar mensagens/e-mails reais ou publicar no domínio de produção. Sem autorização, entregar o build/patch/evidências e marcar produção BLOCKED.

## Instruções operacionais e economia

- Não executar nova análise geral, não refazer 141 testes isoladamente e não gerar relatórios longos. Rodar o script de build e os testes em lote, corrigindo apenas erros verificáveis.
- Não imprimir ENV, credenciais ou conteúdo de conversas. Não coletar dados reais para teste.
- Se alguma conexão necessária estiver indisponível, registrar BLOCKED com a causa uma única vez, seguir tarefas independentes, solicitar acessos de staging num único bloco.
- Entregar **um** ZIP final com código/testes, patch de alterações e matriz compacta de evidências; sem assumir que o sistema está pronto antes dos gates.

**Evidência de entrada:** `npm test` **141/141 PASS**. Análise estática TS **256/256**, imports **0 faltando**, rotas **83/83**. Lockfile **6 inconsistências**; npm registry `EAI_AGAIN` e ausência de `node_modules`; build/lint/tsc/E2E **não certificados**. Nenhuma migration ou deploy em produção ocorreu.
