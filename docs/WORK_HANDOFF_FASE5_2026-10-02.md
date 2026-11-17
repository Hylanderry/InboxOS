# InboxOS — Handoff executável para o ChatGPT Work

**Preparado em:** 02/10/2026 — **Projeto:** InboxOS (painel SaaS multi-tenant para WhatsApp e operação comercial).
**Ponto de partida:** `inboxos-fase5-evolution-hardening-2026-10-02.zip` (pacote completo que acompanha este documento).
**Estado real:** *implementação local em curso; produção NÃO homologada.*
**Objetivo:** concluir, testar e documentar tudo o que falta para tornar o InboxOS publicável com segurança, sem quebrar módulos existentes.

> **Instrução central para o Work:** não produza somente outro plano. Abra este ZIP, execute as tarefas em etapas, corrija o código e rode os testes; para cada etapa, apresente alterações, logs/resumos verificáveis, riscos e um `PASS`, `FAIL` ou `BLOCKED`. **Jamais** assuma aprovação de build, API, banco, provedor, navegador ou deploy sem evidência da execução correspondente.

## 1. Escopo, arquitetura e decisões já tomadas

O InboxOS é um app **TypeScript, React 19, TanStack Start/Router, Vite, Netlify, Supabase/PostgreSQL**, com **Evolution API** (WhatsApp), **Groq** (agentes de IA) e **Resend** (OTP/transacionais e Broadcasts). Inclui painel da operação, Inbox, CRM, follow-ups, contatos, dispositivos, workspace, módulos globais de administrador e newsletter com mídia. Há **multi-tenancy** e autorização por papéis locais de workspace e por papéis globais `superadmin`, `operator`, `support`, `auditor`.

**Limites de escopo que não devem mudar sem autorização:**

- Billing **OFF** no core: `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`. Não implementar checkout, cobranças nem integração financeira neste release; haverá fork separado.
- Funcionalidade bilíngue fora do escopo; não redesenhar a UI nem migrar framework como parte do hardening.
- Preservar a semântica do código e migrations existentes; fazer alterações mínimas, auditáveis e testadas.
- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, `INTEGRATION_VAULT_KEY`, Evolution, Resend ou Groq em bundles `VITE_*`, no Git, nos logs ou neste documento.
- Preferir **`INTEGRATION_VAULT_KEY`** para o pacote atual, exatamente como implementado. Relatórios antigos mencionam `SYSTEM_VAULT_KEY` ou `INTEGRATIONS_MASTER_KEY`; são de outras variantes, **não misturar**.

## 2. Onde estão as fontes e o que já foi comprovado

**Comece pelo ZIP da Fase 5 anexo, NÃO pelas variantes anteriores.** Aplique futuras correções sobre ele.

Arquivos principais a examinar primeiro:

- `package.json`, `package-lock.json`, `vite.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.js`.
- `scripts/prepare-production-build.sh`, `scripts/netlify-build-gate.mjs`, `scripts/audit-release-readiness.mjs`, `scripts/lib/release-validation.mjs`, `scripts/validate-staging-target.mjs`, `scripts/audit-production-env.mjs`.
- `.github/workflows/release-gates.yml`, `.github/workflows/staging-smoke.yml`.
- `src/server/middleware/auth.ts`, `src/server/middleware/access-auth.ts`, `src/server/auth/`, `src/server/admin/`, `src/server/evolution/`, `src/server/email/`, `src/server/product/billing-flag.ts`.
- `src/routes/api/`, `src/routeTree.gen.ts`, `netlify/functions/`, `supabase/migrations/`.
- `tests/`, `docs/DEPLOY_CHECKLIST_2026-09-30.md`, `docs/PRODUCTION_FINALIZATION_PHASE3_2026-10-02.md`, `docs/API_ENDPOINTS_ADM_2026-10-01.md`.

### Evidência histórica da Fase 4 (substituída pela Fase 5)

- **119/119 testes Node aprovados**; todos incluem verificações unitárias/estáticas, **não** simulam o backend inteiro em rede.
- Adicionados/ajustados: `src/server/middleware/auth.ts` aguarda gravação de atividade e a espaça em **5 minutos**; limitação de mutações autenticadas agora usa user ID, sem cabeçalhos de IP manipuláveis; smoke remoto exige hostname `deploy-preview-N--SITE.netlify.app`; workflow chama validador compartilhado; testes de regressão.
- Diagnóstico de lockfile (do pacote-base, antes de `npm install`): **6 divergências**: itens antigos `@lovable.dev/mcp-js`, `@sentry/cloudflare`, `@lovable.dev/vite-tanstack-config`, `nitro` constam apenas do lock raiz; `@netlify/vite-plugin-tanstack-start@1.3.19` falta no lock raiz e nas resoluções.
- O executor onde foi produzida esta entrega respondeu `EAI_AGAIN` para `registry.npmjs.org` e, por isso, **não comprovou** `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, Deploy Preview, E2E autenticado, testes reais de fornecedores nem testes SQL transacionais.
- Registros prévios de auditoria mostram Supabase Security Advisor sem alertas na data consultada; **reexecutar** no staging e antes do lançamento. O status anterior não prova ausência de problemas hoje.

**Portão inegociável:** não relatar "production ready" por causa dos 119 testes. A certificação exige concluir E1–E6 abaixo.

## 3. Procedimento de execução, por etapas

### E0 — Ingestão, preservação e inventário (P0)

1. Extraia o ZIP em workspace próprio, preserve os arquivos originais e crie uma branch de trabalho, ex. `release/inboxos-prod-readiness`. Nunca recomece do projeto anterior.
2. Registre SHA-256 do ZIP e identifique arquivos alterados. Caso tenha repositório GitHub conectado, compare a branch real com o ZIP: não force push nem substitua arquivos sem examinar a diferença.
3. Confirme Node **22.16.0** e npm **10.9.2** (ou versões compatíveis confirmadas), nome do app, flags Billing OFF, rotas, migrações e ambientes.
4. Verifique configurações de CI, Netlify e ausência de `.env` real/segredos no pacote. Gere um inventário de API por método/caminho a partir do código, sem assumir o relatório histórico completo.
5. **Saída:** árvore de arquivos, hash do ZIP, diff inicial, matriz de pendências. Sem mudanças no banco remoto.

### E1 — Resolver lockfile, executar e APROVAR build (P0; primeiro bloqueio externo)

Em ambiente confiável com acesso ao registry npm:

```bash
node --version && npm --version
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
git diff -- package-lock.json
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
```

- Rever as seis divergências e o diff do lock; **não inventar hashes nem remover a verificação**. Verificar compatibilidade entre TanStack Start, router-plugin, Vite e adapter Netlify oficial antes de mudar versões.
- Se lint/typecheck/build falharem, corrigir causas reais (imports, tipos, hooks, API Netlify/TanStack, SSR, roteamento). Não substituir erros por `@ts-ignore` indiscriminado, `any` em massa ou desativação geral de regras.
- Executar `npm audit` e analisar advisories por gravidade e alcance; não atualizar dependências indiscriminadamente sem reteste.
- Confirmar `dist/client` e artefatos server/Netlify gerados; smoke local com `npm run dev`/`preview` conforme adapter.
- **Critério PASS:** `npm ci`, 119+ testes, auditoria, ESLint, `tsc --noEmit`, build real e smoke local passam no mesmo commit; lockfile versionado e reprodutível. Informar versões/hashes e capturar logs sanitizados.
- **Se DNS/registry indisponível:** status `BLOCKED`, erro literal e comandos pendentes; **não** classificar a etapa como concluída.

### E2 — Banco Supabase isolado e migrações (P0; obrigatório antes de mexer no vivo)

1. Criar/usar **projeto de STAGING separado**, com dados sintéticos, URL/chaves separadas e backup/snapshot antes de mudanças.
2. Conferir histórico local vs `supabase_migrations.schema_migrations` no staging e no projeto vivo por consultas **read-only**. Há diferenças históricas, especialmente **14–26/09**; não rodar `supabase db reset` nem `supabase db push` cegamente no banco vivo.
3. Revisar a migration **`supabase/migrations/20261001230000_protect_last_privileged_members.sql`**, **ainda não comprovadamente aplicada ao vivo**. Testar sua execução em STAGING após reconciliação; verificar triggers para último owner e último superadmin e suspensão global.
4. Validar `20261001134743_atomic_workspace_owner_transfer.sql` na cópia staging, incluindo permissões `service_role`, e teste concorrente com duas transações/operadores tentando remover owners/superadmins simultaneamente. Consultar documentação atual do Supabase para CLI e RLS antes de alterações.
5. Testar isolamento de pelo menos **dois tenants**: associação em workspace A não permite ler/escrever B; validar membership, suspensão, convites, troca de owner, sessões revogadas e acesso ao Storage.
6. Rodar Security e Performance Advisors; verificar RLS em tabelas expostas, `SECURITY DEFINER` com `search_path` e privilégios mínimos; analisar índices e integridade relacional.
7. **Critério PASS:** staging migrado e reconstruível a partir do repositório, testes SQL concorrentes automatizados, RLS/isolamento comprovados, rollback documentado. **Aplicar no vivo somente após aprovação explícita do usuário, backup e janela de manutenção.**

### E3 — API, identidade e ADM autenticados (P0)

Com app deployado apenas em staging, usuários de teste verificados e Supabase Auth staging:

- Cadastro PF/PJ, OTP de registro e login, resend, expiração, limite de tentativas, reenvio, códigos incorretos, múltiplas sessões/dispositivos e revogação.
- Recuperação de senha, consumo único de grant; falhas simuladas entre atualização de banco, Auth e notificações (a operação não é transação distribuída); troca de e-mail (old/new) e telefone; 409 após token usado.
- Negativas 401/403/404/409/429/503 e sucesso 200/201 para cada método/rota apropriado; autenticação deve ocorrer antes de mutações e validações que possam vazar dados.
- Papéis `superadmin`/`operator`/`support`/`auditor`, guards distintos de `owner`/`admin`/`agent` de workspace; bootstrap global somente e-mail verificado; último owner e superadmin preservados, inclusive concorrência.
- Inventariar e testar os **103 contratos históricos** (recalcular número efetivo na nova revisão). Cobrir IDs inválidos, outros tenants, sessões suspensas, erros de rede, payload grande e idempotência.
- **Critério PASS:** relatório endpoint por endpoint com método, HTTP esperado/obtido, dados sintéticos, log sanitizado e casos positivos/negativos; zero acesso cross-tenant.

### E4 — Evolution, Groq, Resend, newsletter e jobs (P0)

Exigir credenciais **de homologação**. Não usar contatos reais nem enviar massa de e-mails; usar números de teste e contatos com consentimento explícito.

- **Evolution:** instância nova e existente, QR, reconexão, texto/mídia, webhook assinado/token atual e anterior revogado, reentrega/duplicidade, replay, retry/backoff, falha parcial e recuperação do worker, filas e dead-letter, sincronização de contatos e grupos.
- **Groq:** teste manual e automático, chave do cofre, workspace correto, modelo válido, limite de tempo, indisponibilidade, custos/quotas, corrida e prevenção de respostas duplicadas.
- **Resend Auth:** domínio de envio verificado, OTP e transacionais, templates, logs sem PII, bounce e falha de envio.
- **Newsletter:** imagens/vídeos válidos e MIME falsificado rejeitado; tamanho de upload conforme limite real da Netlify (rever limites publicados); armazenamento público para mídia enviada intencionalmente em e-mails, **nunca escrita anônima**; composição de Broadcast, segmento de teste consentido, confirmação explícita, envio, agendamento/cancelamento, descadastro, retries e duplicidade.
- **Jobs:** verificar existência e execução real de Netlify Background Functions, limites de timeout/tamanho/concorrência, autenticação machine-to-machine e métricas.
- **Critério PASS:** evidências por provedor, chamadas reais apenas em staging, relatórios de falhas e recuperação, e nenhuma credencial vazada.

### E5 — Frontend, UX e preview com CI (P1)

1. Conectar o repositório ao GitHub e a Netlify ao branch; garantir que `.github/workflows/release-gates.yml` passa no PR e que `netlify.toml` invoca `npm run build:gated`. O CI inicialmente falhará enquanto E1 não estiver resolvido — **não contornar o gate**.
2. Criar Deploy Preview Netlify com ENV e instâncias de homologação, diferente do URL de produção.
3. Para smoke de APIs **não autenticadas** (não faz envios reais):

```bash
TEST_BASE_URL=https://deploy-preview-123--seusite.netlify.app \
PRODUCTION_APP_URL=https://app.seudominio.com \
node --experimental-strip-types scripts/validate-staging-target.mjs

TEST_BASE_URL=https://deploy-preview-123--seusite.netlify.app \
PRODUCTION_APP_URL=https://app.seudominio.com \
npm run test:integration
```

4. Fluxo real no navegador: `/admin/`, Inbox, Chats, CRM, Settings, convites, instâncias, newsletter e estados de erro. Telas **320/360/390/430 px**, tablet, desktop, landscape, viewport curto e teclado mobile/iOS. Verificar navegação, modais, carregamento, acessibilidade básica e regressão visual.
5. Validar SSR/rotas deep-link, headers, cookies, CORS/CSRF, performance, limites de payload e observabilidade em logs da Netlify.
6. **Critério PASS:** CI verde, Deploy Preview funcional, teste HTTP anônimo + testes autenticados, capturas de tela/matriz UX, plano de rollback em staging comprovado.

### E6 — Aprovação e release final (P0; somente após E1–E5)

- Documentar env **por nome e escopo**. No servidor: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, `INTEGRATION_VAULT_KEY` (base64 de 32 bytes), `RESEND_API_KEY`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`, `GROQ_API_KEY`; no browser apenas `VITE_SUPABASE_*` públicos. Rever `PUBLIC_APP_URL` e DNS/domínios; **não colar valores reais em chat/logs**.
- Confirmar `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` vazio após primeira conta global ativa e verificada; flags de Billing OFF.
- Fazer backup de produção e preparar rollback (código, env, funções, configuração de webhook e migrations compatíveis); NÃO reverter DDL em produção sem estratégia testada.
- Antes do go-live, entregar resumo dos gates com evidência e obter **aprovação explícita do usuário** para alterações no projeto vivo, envio real e promoção da Netlify para produção.
- Após aprovação, executar checklist de publicação controlada; conferir login, health, endpoint privado, webhooks, envio/recebimento de teste autorizado, filas, erros 5xx, email bounce e disponibilidade. Monitorar e definir gatilhos para rollback.
- **Critério PASS:** gates E1–E5 verdes, aprovação, deploy e smoke de produção autorizados, rollback operacional e relatório final.

## 4. Tarefas específicas que podem ser feitas antes de credenciais/staging

Aproveitar o ambiente do Work para fazer **sem solicitar autorização a cada arquivo**: instalar npm corretamente e regenerar lockfile; corrigir ESLint/TypeScript/SSR/adapter; melhorar testes unitários; mapear endpoints e erros; criar fixtures multi-tenant; configurar playbooks; validar estrutura do ZIP e arquivos; produzir diff/patch/PR; documentar segredos por nome.

Ações que **dependem de dados externos ou acesso concedido**: provisionar Supabase staging, ler resultados do deploy Netlify, executar migrations no staging, conectar QR de Evolution de testes, configurar remetente Resend, chave Groq de teste, enviar campanhas consentidas, usar GitHub/Netlify. Se integração inacessível, não afirmar resultado; marcar a tarefa `BLOCKED` com responsável e ação mínima necessária.

Ações que **não devem ser executadas automaticamente**: `db reset`, DDL/data migration em banco vivo, envio em massa, uso de números/contatos reais, rotação de segredos em produção, publicar no domínio final, reinicializar banco, desabilitar guardas/CI para “ficar verde”. Exigir aprovação do usuário.

## 5. Formato de acompanhamento e de entrega

Criar/atualizar `docs/QA_EVIDENCIAS_RELEASE.md` com uma linha por gate:

| Etapa | Caso | Status (PASS / FAIL / BLOCKED) | Evidência concreta | Alteração/PR | Responsável e desbloqueio |
|---|---|---|---|---|---|
| E1 | `npm ci` | BLOCKED até executar | log exit/status | commit | Work/rede npm |
| E1 | lint/typecheck/build | BLOCKED até executar | log + commit hash | commit | Work |
| E2 | migration e concorrência em staging | BLOCKED | SQL + logs | migration | Work + projeto staging |
| E3 | contratos HTTP autenticados | BLOCKED | matriz de casos | tests | Work + staging |
| E4 | Evolution/Groq/Resend reais | BLOCKED | IDs de teste anonimizados | tests | Work + credenciais sandbox |
| E5 | CI + Deploy Preview/mobile | BLOCKED | links CI/deploy + capturas | PR | Work + GitHub/Netlify |
| E6 | produção e rollback | BLOCKED | autorização + runbook | release | usuário |

**Não reutilizar os números do relatório anterior como evidência de nova execução.** Os critérios de aprovação incluem:

1. Arquivos completos ou PR e patch que correspondem ao código testado;
2. Lockfile real, reproduzível e auditado;
3. `npm ci`, testes, lint, TypeScript, build e smoke local aprovados;
4. Staging separado com migrations e RLS validadas;
5. Testes HTTP e E2E reais com dois tenants, múltiplos papéis, OTP e integrações;
6. Deploy Preview + revisão UX + monitoração + rollback;
7. Autorização explícita para as mudanças irreversíveis ou de produção.

## 6. Prompt resumido para iniciar no Work

> **Execute a finalização de produção do InboxOS usando o ZIP e este handoff como fonte de verdade.** Não fique só no planejamento: instale dependências, corrija lockfile, teste, faça lint/typecheck/build e depois trabalhe por E0–E6. Examine cada mudança, gere testes de regressão, não viole isolamento multi-tenant, mantenha Billing desligado e não opere no banco/serviços de produção sem minha aprovação explícita. Para cada etapa, entregue PASS/FAIL/BLOCKED com evidência, arquivos modificados, diff, logs sanitizados e pendências. Se depender de acessos que eu não forneci, deixe a tarefa marcada com os requisitos exatos e continue nas independentes. Ao final, entregue o projeto completo atualizado e um relatório de homologação, sem chamar de production-ready enquanto algum bloqueador permanecer.


## 7. Atualização incremental — Fase 5 (02/10/2026) — LEITURA OBRIGATÓRIA

**Nova versão canônica:** `inboxos-fase5-evolution-hardening-2026-10-02.zip`. Não iniciar pelo ZIP da Fase 4, que deve ser mantido somente como baseline de comparação.

**Implementado na Fase 5:** assinatura HMAC interna do consumidor da fila, vinculada ao `eventId`, timestamp (janela ±5 minutos) e corpo exato; remoção de token Evolution por query string; webhook rate limit não usa IP forjável e falha fechado com 503; quota por token 1.200/min; claim condicional de evento/attempt para bloquear duas entregas simultâneas; falhas persistidas para retry/dead-letter. Documentação dentro do ZIP: `docs/FASE5_EVOLUTION_HARDENING_2026-10-02.md`.

**Nova evidência local:** `npm test` **124/124 PASS**; parser 252 fontes TS/TSX/MTS sem erros; imports 0 faltantes; 83 rotas; seis divergências de lockfile ainda pendentes. `npm install --package-lock-only` falhou `EAI_AGAIN`. Sem build completo, deploy, testes HTTP E2E ou validação de concorrência no banco.

**Novos bloqueadores prioritários a resolver no Work em E2/E4:**

1. Implementar, executar e comprovar rotina agendada para reenfileirar eventos `failed` com `next_attempt_at` vencido, `queued` que ficaram sem invocação, e `processing` sem heartbeat/lease que sofreram timeout; confirmar Netlify Scheduled/Background Functions, idempotência, concorrência, retenção e política de dead-letter. NÃO somente escrever um plano.
2. Reentrega Evolution de evento já persistido, mas não completado: atual `ignoreDuplicates` responde `202 duplicated`; demonstrar que o worker de recuperação foi acionado para estados intermediários/failed. Evitar duas chamadas simultâneas ao provedor.
3. Testar assinatura HMAC válida, ausente, corpo/ID alterados, timestamp fora da janela e replays; antiga autenticação por `?token=` não é mais válida, atualize configurações de instância legada para header se houver.
4. Simular desligamento do banco em rate limit: verificar HTTP **503** `Retry-After`, reenvio da Evolution; exceder quota deve ser **429**, sob limite funciona; medir capacidade por token com várias instâncias.
5. Confirmar pós-ACK idempotência de envio, persistência, sincronização de grupos e chamada a agente para eventos reentregues ou worker interrompido.

**Critério:** não considerar E4 PASS sem simulação de falhas/retries no staging e evidência do recuperador periódico. Preservar `INTEGRATION_VAULT_KEY`, `AUTH_CRYPTO_SECRET`, Billing OFF e isolamento multi-tenant.
