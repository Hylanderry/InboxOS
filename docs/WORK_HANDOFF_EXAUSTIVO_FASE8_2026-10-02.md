# INBOXOS — ESPECIFICAÇÃO COMPLETA DE FINALIZAÇÃO PARA CHATGPT WORK

**Versão:** Fase 8 — 02/10/2026  
**Projeto:** InboxOS (SaaS de atendimento WhatsApp, multi-tenant)  
**Entrada única:** `inboxos-fase8-preparado-para-work-2026-10-02.zip` (o arquivo entregue com este handoff)  
**Documento canônico:** `docs/WORK_HANDOFF_EXAUSTIVO_FASE8_2026-10-02.md`  
**Perfil de execução:** econômico; reparar somente erros reproduzidos, executar testes em lote, não repetir pesquisas/auditorias estáticas já concluídas.  
**Status:** código testado localmente; **NÃO homologado para produção**.  
**Decisão do proprietário:** manter o custo do Work e de infraestrutura no mínimo; não executar nada que cobre, envie mensagens reais ou altere produção sem autorização específica.

> **COMANDO-BASE PARA O WORK:** Use apenas o ZIP Fase 8 como fonte de código. Leia primeiro esta página e os quatro arquivos indicados na E0. **Execute** as etapas, não apenas produza um plano. Corrija o mínimo que for necessário, produza testes que comprovem cada correção e pare nas ações irreversíveis ou que exijam aprovação. Entregue um ZIP novo e uma matriz PASS/FAIL/BLOCKED com evidências. Este handoff contém o que precisa ser feito — não recomece a investigação de Fases 1–7.

---

## 0. OBJETIVO, LIMITES E CONTRATO DE ENTREGA

### 0.1 Resultado desejado

1. Dependências coerentes e reprodutíveis (`package.json` + `package-lock.json`) e um **build de produção real** com adaptador oficial TanStack Start / Netlify.
2. Testes unitários, lint, typecheck, geração real da árvore de rotas e build aprovados e documentados; corrigir erros que os gates revelarem.
3. Uma base **staging** separada, com SQL/regras equivalentes às aplicadas no sistema, incluindo migrations e permissões; nenhum reset da base viva.
4. Testes E2E e de APIs com autenticação e dados sintéticos para fluxos críticos de segurança, isolamento por workspace e administração global.
5. Verificação de Evolution API, cron, workers, Groq, Resend, Storage e newsletter utilizando **somente contas/instâncias/teste consentidas**; sem campanhas ou mensagens reais.
6. Deploy Preview isolado, UI funcional nos tamanhos-alvo, registro de erros, rollback preparado. A produção somente poderá ser promovida após gates verdes **e aprovação explícita**.

### 0.2 NÃO FAZER

- **NÃO** reconstruir do zero, trocar framework, inventar arquitetura, substituir integrações, modificar branding/design global, aumentar escopo ou propor Billing neste core.
- **NÃO** alterar sistemas ativos, executar `supabase db reset`, `supabase db push`, `migration repair`, DDL, truncates, deletes ou inserts de dados de teste no **Supabase vivo** sem autorização posterior, escopo e backup. Consultas somente leitura são permitidas quando necessárias para comparação.
- **NÃO** publicar em produção, atualizar webhooks reais, mudar DNS, enviar WhatsApp/e-mails reais, migrar contatos, ativar automações reais ou criar plano de cobrança sem autorização explícita do proprietário.
- **NÃO** usar dados reais de conversas, contatos, mídia, telefones ou credenciais em logs, prints, repositório, testes e relatórios.
- **NÃO** inventar hashes/integridades de dependências, burlar ESLint/TS/CI, colocar `// @ts-ignore` em massa, desativar RLS, afrouxar autenticação ou retornar HTTP 200 para esconder falhas.
- **NÃO** mudar o segredo do cofre criptografado (`INTEGRATION_VAULT_KEY`) de um ambiente com dados sem procedimento de recriptografia/rotação, pois isso inviabiliza descriptografar segredos persistidos.
- **NÃO** misturar esta variante com outras do dia 01/10 que usam `SYSTEM_VAULT_KEY`, `INBOXOS_VAULT_KEY` ou `INTEGRATIONS_MASTER_KEY`. A variável correta desta base é **`INTEGRATION_VAULT_KEY`**, em base64 de **exatamente 32 bytes**.
- **NÃO** divulgar valores de `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `GROQ_API_KEY` nem material criptográfico.

### 0.3 Prioridade de custo e estratégia operacional

- Executar **uma sequência de comandos por etapa**, capturando logs/exit codes sem imprimir segredos. Não gastar créditos reanalisando centenas de arquivos já auditados.
- **E1 vem antes de qualquer alteração adicional no código.** Sem `npm ci`, lint, tsc e build reais, não há justificativa para corrigir componentes aleatórios.
- Preferir ambiente local/CI efêmero e testes com mocks/sandbox a provisionar novos serviços pagos. Só criar Supabase staging ou deploy temporário se um serviço gratuito/ambiente isolado existente não suprir o teste.
- Ao encontrar ausência de acesso (npm, GitHub, Netlify, Supabase staging, Evolution sandbox, Groq sandbox, Resend de teste), registrar **uma única vez** como BLOCKED, guardar o comando e seguir tarefas independentes. Agrupar todas as solicitações de acesso/autorizações em uma única pergunta ao proprietário, sem repetir.
- Não refazer 149 testes individualmente. Rodar `npm test` após mudança relevante e novamente ao final; rodar testes direcionados apenas durante diagnóstico.
- Corrigir somente `FAIL` reproduzido ou falha de segurança demonstrada. Manter funcionalidades e layout existentes.
- Concluir entregando **1 ZIP final**, **1 patch**, **1 relatório enxuto de evidências** e **1 lista curta de ações do proprietário**, caso existam. Não gerar vários relatórios redundantes.

---

## 1. ESTADO CONHECIDO DO CÓDIGO (NÃO PRECISA REDESCOBRIR)

### 1.1 Tecnologias, implantação e parâmetros reais

| Camada | Implementação existente | Observações |
|---|---|---|
| UI | React 19 + TypeScript + TanStack React Router/Start + Vite 8 | App file-based; `src/routes`, `src/routeTree.gen.ts` |
| Dependências | npm 10.9.2; Node **22.16.0**, projeto exige >=22.12.0 | `.github/workflows/release-gates.yml`, `netlify.toml` |
| Hospedagem | Netlify | `netlify.toml` usa `npm run build:gated` e `publish = "dist/client"` |
| Adaptador | `@netlify/vite-plugin-tanstack-start@1.3.19` | Declarado no `package.json`, **ausente/divergente no lockfile** |
| Banco/identidade | Supabase Postgres/Auth/Storage; servidor com `service_role` | `supabase/migrations`, `src/integrations/supabase`, `src/server/middleware` |
| WhatsApp | Evolution API | webhook + `evolution_events`, funções background e recuperação programada |
| IA | Groq | agentes por workspace/conexão; preservar proteção contra respostas duplicadas |
| E-mail | Resend | OTP/transacional, newsletter/broadcasts, idempotência e controle de audiência |
| ADM | Control Plane global separado dos workspaces | `superadmin/operator/support/auditor`, cofre criptografado, auditoria |
| Multi-tenant | workspace no servidor + guards relacionais/RLS | Testar autorização com 2 tenants; não confiar só no ID enviado pelo browser |
| Billing | **Intencionalmente OFF** | `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`; fora do release principal |

**Código-base canônico:** o ZIP Fase 8, que inclui correções das Fases 1–8. Evitar abrir ZIPs mais antigos ou reler atas extensas. As especificações antigas em `/docs` servem como referência de comportamento, mas testes e runtime da versão atual prevalecem.

### 1.2 Evidências existentes, não confundir com homologação

- `npm test`: **149/149 aprovados** nesta revisão local. Incluem testes estáticos e unitários; não certificam E2E real.
- `npm run audit:release`: **258** arquivos TS/TSX/MTS analisados sem falha de **sintaxe**, **0 imports locais ausentes**, **83 rotas representadas**, Billing protegido. É pré-flight **estático** e continua **FAIL** por lockfile.
- Divergências de dependências encontradas: **6**:
  1. `@lovable.dev/mcp-js` apenas no lock raiz;
  2. `@sentry/cloudflare` apenas no lock raiz;
  3. `@netlify/vite-plugin-tanstack-start` divergente/ausente no lock raiz;
  4. entrada instalada de `@netlify/vite-plugin-tanstack-start` ausente no lock;
  5. `@lovable.dev/vite-tanstack-config` apenas no lock raiz;
  6. `nitro` apenas no lock raiz.
- `npm install`/`npm ci` bloqueados anteriormente por `EAI_AGAIN`/`ENOTCACHED` no executor; sem `node_modules` completo. **NÃO** afirmar lint/tsc/build aprovados, nem que os provedores foram integrados de ponta a ponta.
- Supabase vivo foi consultado **somente leitura**; Security Advisor sem alertas na última consulta, mas isso não prova conformidade integral. O histórico SQL remoto e local **não está 100% alinhado**.
- O código da Fase 8 bloqueia redirects em `fetchCredentialed`, usa timeouts e retry limitado do Resend com mesma idempotency key, e reforça Evolution worker e origens confiáveis.
- Arquivos de evidência: `docs/QA_EVIDENCIAS_RELEASE.md` e `docs/WORK_HANDOFF_MINIMO_FASE7_2026-10-02.md` (este documento Fase 8 substitui o handoff Fase 7).

### 1.3 Recursos e pontos de entrada — caminhos exatos

| Finalidade | Arquivos/caminhos |
|---|---|
| Dependências e compilação | `package.json`, `package-lock.json`, `vite.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.js` |
| Preparar build | `scripts/prepare-production-build.sh` |
| Gates Netlify | `scripts/netlify-build-gate.mjs`, `scripts/audit-release-readiness.mjs`, `scripts/audit-production-env.mjs`, `scripts/lib/release-validation.mjs` |
| CI GitHub | `.github/workflows/release-gates.yml`, `.github/workflows/staging-smoke.yml` |
| Integração HTTP não autenticada | `tests/integration.test.ts`, `scripts/validate-staging-target.mjs`, `tests/staging-target-policy.ts` |
| Auth e sessão | `src/server/auth/*.server.ts`, `src/server/middleware/*.ts`, `src/server/auth-context.ts`, `src/routes/api/auth/**` |
| Administração global | `src/server/admin/*.server.ts`, `src/routes/api/admin/**`, `src/server/admin/bootstrap-policy.ts` |
| Evolution/Webhook | `src/routes/api/public/webhooks/evolution.ts`, `src/server/evolution/event-inbox.ts`, `src/server/evolution/background-dispatch.ts`, `src/server/evolution/webhook-rate-limit.ts` |
| Recuperação agendada | `netlify/functions/evolution-recover.mts`, `netlify/functions/evolution-events.mts`, `src/server/evolution/recovery.server.ts`, `recovery-policy.ts` |
| Origens seguras | `src/server/security/trusted-app-origin.ts`, `src/server/security/credentialed-fetch.ts` |
| Newsletter | `src/server/admin/newsletter.server.ts`, `newsletter-render.ts`, `media-signatures.ts`, `src/lib/newsletter-upload-policy.ts` |
| Resend | `src/server/email/resend.server.ts`, `resend-retry-policy.ts`, `delivery.server.ts` |
| Cofre de integrações | `src/server/admin/integration-vault.server.ts`, `vault-crypto.ts` |
| CRM e automação | `src/server/product/workspace-product.server.ts`, `src/routes/api/crm/**`, `src/routes/api/agents/**`, `src/routes/api/follow-up/**` |
| Migrations | `supabase/migrations/*.sql`; atenção a `20261001134743_...` e `20261001230000_...` |
| Relatórios | `docs/FASE6_EVOLUTION_RECOVERY_2026-10-02.md`, `docs/FASE7_ORIGENS_E_RETRY_2026-10-02.md`, `docs/QA_EVIDENCIAS_RELEASE.md` |

---

## 2. EXECUÇÃO PASSO A PASSO, COM COMANDOS E CRITÉRIOS

### E0 — Preservar a base e confirmar execução (P0, barata, 1 passagem)

**Ação:**

1. Descompactar o ZIP Fase 8 em uma pasta limpa. Confirmar que o projeto raiz possui `package.json`, `package-lock.json`, `netlify.toml`, `src`, `tests`, `scripts`, `supabase`, `.github`.
2. Registrar SHA-256 do ZIP e a lista de alterações versionadas em uma branch privada; não fazer push/deploy automático antes de CI.
3. Verificar Node/npm e se há acesso ao registry oficial; sem repetir checagens de rede em loop.
4. Ler **somente** `package.json`, `scripts/prepare-production-build.sh`, `scripts/audit-release-readiness.mjs`, `docs/QA_EVIDENCIAS_RELEASE.md` e este handoff. Consultar outros arquivos conforme diagnóstico.
5. Garantir que nenhum `.env` real nem chave privada entrou no ZIP. `.env.example` e `.env.netlify.example` são placeholders; jamais comitar valores reais.

**Comandos:**

```bash
node --version
npm --version
npm config get registry
node -p "require('./package.json').name"
node scripts/netlify-build-gate.mjs --plan
```

**PASS:** a fonte canônica foi identificada, os arquivos estão íntegros e a branch/snapshot está preservado. **BLOCKED:** acesso GitHub não disponível (trabalhar em cópia local e entregar ZIP). Não precisa pedir credenciais para E0/E1.

### E1 — Corrigir lockfile e certificar o build real (P0, PRIMEIRO BLOQUEADOR)

**Problema reproduzido:** `package.json` e lockfile divergentes; dependências Netlify/TanStack e ferramentas não instaladas. Parser TS sem erros não equivale a `tsc` nem bundle completo.

**Execução obrigatória, em Node 22.16.0 / npm 10.9.2 com rede:**

```bash
# Execute em ambiente confiável; este script não publica nem modifica banco.
bash scripts/prepare-production-build.sh

# O script executa, nesta ordem:
# npm install --package-lock-only --ignore-scripts --no-audit --no-fund
# npm ci --include=dev --include=optional --no-audit --no-fund
# npm test
# npm run audit:release
# npm run lint
# npx --no-install tsc --noEmit
# npm run build
```

**Tarefas para corrigir caso haja FAIL:**

1. Atualizar o lockfile **somente via npm oficial**; conferir diff do `package-lock.json` para remover as quatro dependências diretas antigas e incluir o adaptador Netlify `1.3.19` com integridades reais. Preservar os `overrides` existentes (inclusive `rolldown`) se ainda válidos; não mexer em versões sem necessidade.
2. Repetir `npm ci` para provar instalação reprodutível em ambiente limpo. Se erro de peer dependency, investigar versões do TanStack/React/Vite e resolver a incompatibilidade **documentando a alteração**. Não usar `--force`/`--legacy-peer-deps` como solução permanente sem justificativa e teste.
3. Executar lint; corrigir warnings/errors reais por módulo sem suprimir regras globalmente. Priorizar segurança, lógica e imports. O legado tem `any` e formatação inconsistente; refatorar gradualmente e somente o necessário para gate, evitando alteração de comportamento.
4. Executar `npx --no-install tsc --noEmit`, corrigir erros verdadeiros, conferir `vite/client` e tipos de funções Netlify. Se necessário, alinhar versões na combinação mínima, não fazer atualização geral de dependências.
5. Executar Vite/Netlify build e confirmar estrutura em `dist/client` e empacotamento do handler SSR para Netlify; usar o adaptador oficial presente em `vite.config.ts`.
6. Comparar `src/routeTree.gen.ts` antes/depois do build e confirmar que a regeneração oficial mantém as rotas esperadas, sem API desaparecida ou colisões.
7. Confirmar gate CI no `.github/workflows/release-gates.yml`; **não** publicar com testes desativados. Se rodar em Netlify, `netlify.toml` já utiliza `npm run build:gated` (testes, auditoria, lint, TypeScript e build; no contexto `production` inclui também auditoria de ENV).
8. Depois do build, iniciar localmente (`npm run dev`, ou teste do bundle SSR apropriado) e acessar a página inicial + `GET /api/health`; não usar chaves de produção.

**Critérios de aceite:** instalação limpa sem workaround inseguro; `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build` **todas exit code 0**; bundle publicado em `dist/client`; output SSR do adaptador verificável; nenhum segredo exposto no frontend; `package-lock.json` versionado e coerente; logs com comandos e resultados, **sem chaves**.

**Se bloqueado por DNS:** registrar último comando/erro `EAI_AGAIN` ou `ENOTCACHED` e seguir E2/E3 sem insistir. Não criar integridades fictícias. Não marcar build PASS.

**Fonte oficial (verificar se necessário):** https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/

### E2 — Banco de dados STAGING, migrations e segurança (P0; sem mutações no vivo)

**Dependência:** staging/ambiente local limpo ou projeto Supabase de teste, nunca o banco ativo. Preferir Postgres/Supabase local via CLI/Docker se isso evitar uma instância paga; usar um projeto staging remoto apenas para Auth, Storage, Netlify e integrações quando necessário.

**Reconciliação obrigatória:**

1. Levantar o histórico local em `supabase/migrations/` e confrontar com `supabase_migrations.schema_migrations` **no staging**, registrando tabelas, funções, triggers, constraints, índices e policies reais.
2. Existem migrations **já registradas no banco vivo** que exigem comparação com os arquivos locais: `20261001001324_atomic_email_challenge_failure_limit`, `20261001134743_atomic_workspace_owner_transfer`, `20260930234620_guard_last_active_superadmin` (a consulta anterior encontrou esse timestamp); **não presumir que todas estejam reproduzidas localmente**.
3. A migration local `20261001230000_protect_last_privileged_members.sql` foi criada na fase de segurança, **não foi aplicada no banco vivo**. Conferir a ordem de execução e simular apenas em staging. Ela acrescenta guards transacionais de último owner, último superadmin e suspensão global.
4. Revisar especialmente que a função `transfer_workspace_ownership(uuid,uuid,uuid)` seja `security invoker`, que `EXECUTE` permaneça apenas para `service_role` e que `anon`/`authenticated` não consigam invocá-la. Verificar concorrência com guard por advisory transaction lock e row locks.
5. RLS: `workspace_members`, `workspaces`, `system_admins`, `system_user_controls`, `newsletter_*`, `evolution_events`, `chats`, `messages`, CRM e agentes não podem entregar/alterar registros de outro tenant; não confiar no workspace enviado pelo cliente.
6. `storage.buckets` / `storage.objects`: newsletter-media pode ter leitura pública para ativos publicados, mas **nunca escrita pública**. Validar MIME aceitos, limite e escrita apenas via serviço autenticado autorizado. Não publicar mídia sensível de conversas em bucket público.
7. Testar idempotência/resultado das migrations num banco descartável; backfill de dados sintéticos e índices exclusivos; comparar schema depois da sequência.
8. Rodar Security Advisor e Performance Advisor. Security com **0 alertas novos**; Performance INFO deve ser registrado sem apagar índice útil por dedução.
9. Confrontar qualquer DDL/trigger antigo com o SQL efetivamente aplicado para não criar dois guards conflitantes. `migration repair` só corrige histórico, não executa SQL: usar unicamente se confirmado por inspeção e **apenas no staging**, como parte de reconciliação versionada.

**Comandos seguros de diagnóstico (apenas ambiente correto):**

```bash
supabase --version
supabase --help
supabase migration --help
supabase migration list --local
# Para staging remoto, conferir cuidadosamente qual projeto está vinculado:
supabase migration list --linked
# Sem db reset/db push/repair no vivo.
```

**Consultas SQL SOMENTE LEITURA exemplares:**

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public'
 and table_name in ('evolution_events','workspace_members','system_admins','email_challenges')
 order by table_name, ordinal_position;
select schemaname, tablename, policyname, cmd, roles
 from pg_policies where schemaname in ('public','storage')
 order by schemaname,tablename,policyname;
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname;
```

**Matriz de concorrência obrigatória em staging** (dados sintéticos, duas sessões independentes):

- Dois owners tentam se remover/rebaixar/suspender em paralelo; nunca terminar com zero owner ativo; uma das operações deve falhar atomicamente com 409/erro de integridade esperado.
- Dois superadmins tentam se desativar/rebaixar/suspender em paralelo; nunca terminar sem superadmin ativo; proteção deve abranger suspensão em `system_user_controls`, não apenas status da linha de `system_admins`.
- Transferência owner A→B válida mantém dono, membro alvo e trilha de auditoria. Transferência inválida/cross-workspace ou para inativo não promove ninguém.
- Sessão revogada não acessa API no próximo request protegido; usuário/workspace suspenso não consegue usar endpoints privados; auditor global só lê, suporte não executa ações de superadmin.
- Duas empresas A e B com usuários/testes distintos: acesso cruzado por UUID (IDOR/BOLA), chat, mídia, contatos, agentes, CRM, follow-up, convite e export deve retornar 403/404 ou vazio, **nunca dados B**.
- Senha/OTP: desafios expirados, bloqueados, consumidos, com código incorreto ou reutilizados não podem completar ação; concorrência usa consumo único.

**Critério de aceite:** staging reconstituível, migrations sem erro e com histórico consistente, RLS/privileged procedures verificados, testes negativos de dois tenants e de concorrência PASS; nenhum comando mutante executado no vivo.

**Fontes oficiais:** https://supabase.com/docs/reference/cli/supabase-migration-list ; https://supabase.com/docs/guides/deployment/database-migrations

### E3 — HTTP, autenticação, perfis e ADM (P0)

**Estado:** `tests/integration.test.ts` hoje testa principalmente acesso **anônimo** (401/403), e **não prova** todas as operações autenticadas. Adicionar/rodar testes autorizados com contas sintéticas em staging, cobrindo rotas listadas no apêndice de inventário.

**Cenários obrigatórios de identidade e segurança:**

- Cadastro PF/PJ: dados válidos, inválidos, duplicados, regras legais, OTP, confirmação, cooldown, limite por usuário/desafio/IP confiável, erro do Resend. Códigos nunca aparecem em resposta/log.
- Login: credenciais corretas/incorretas, OTP e resend, contas bloqueadas, usuário sem confirmação, múltiplos dispositivos, sessão expirada, token adulterado, `Authorization` inválido, logout/revogação -> próxima requisição recebe 401.
- Recuperação de senha: `start/verify/reset`, hash do desafio revalidado, limites, expiração, autorização consumida uma única vez, token usado em paralelo -> só uma mudança; senha antiga negada conforme requisito de mudança.
- Alteração e-mail: confirmação do e-mail antigo e do novo, cancelamento, tentativa de trocar depois da expiração, código errado, reutilização e concorrência. Alteração de telefone: mesma disciplina de desafio.
- Workspace: criação/ativação, troca de workspace, último owner, papéis locais, membros, convites (criar, listar, aceitar, revogar, expirar, aceitar 2x), remoção e reativação. Links de convite devem usar `trustedAppOrigin` e nunca Host/X-Forwarded-Host fornecidos pelo cliente.
- ADM global: `system_admins` e `workspace_members` são autorizações **diferentes**; workspace owner NÃO vira superadmin; bootstrap inicial apenas com e-mail confirmado e allowlist do servidor. Após criar o primeiro admin, fechar/remover `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` antes de produção.
- Testar superadmin/operator/support/auditor e usuário comum em GET/POST/PATCH/ações sensíveis. Esperados: 401 sem sessão; 403 sem papel; 400 payload inválido; 409 conflito/concorrência; 429 rate limit; 503 dependência indisponível; 200/201 somente quando autorizado. **Alguns endpoints podem retornar 404 no lugar de 403 para evitar enumeração — respeitar contrato real.**
- Cofre: criação/rotação/disable/enable das chaves Evolution/Groq/Resend e custom, máscara no GET, ciphertext nunca retornado, chave velha inválida quando rotacionada; fallback ENV apenas nas condições previstas; testar segredo ausente/corrompido sem expor material. Chave mestra server-only.
- Testar integridade de sessão e headers CSRF/origin; envio cross-site anônimo não deve iniciar autenticação ou alteração de recursos.
- Monitorar RLS no banco, eventos de auditoria por operação crítica e resposta HTTP consistente.

**APIs e áreas essenciais:** autenticação `/api/auth/*`, `admin/*`, workspaces, chats, messages, media, CRM, follow-up, agents, instances, dashboard, events, profile e company. **Não supor que os 83 caminhos são 83 métodos:** inventário detalhado encontra-se no Apêndice A.

**Critério:** cada cenário crítico tem request autenticado, estado esperado e consulta do resultado no staging; todos PASS ou BLOCKED motivado. O smoke não pode mandar tráfego para produção.

### E4 — Integrações externas, fila e jobs (P0, custo limitado)

**EVOLUTION API (instância de teste somente):**

- Criar conexão de teste sem usar WhatsApp comercial/contatos reais. QR, conectar/desconectar/reconectar, envio/recepção de texto; grupo, contato, mídia, mensagem com quote, reação, edição, exclusão, histórico e atualização de avatar. Respostas devem ficar no workspace certo.
- Verificar token de webhook na validação de entrada, credencial inválida 401, body inválido 400, instância não cadastrada 404, flood 429 e falha do limitador 503. Chave no URL/query **não é aceitável**.
- Webhook externo não pode se declarar worker apenas com `x-inbox-queue-consumer`; o worker exige `x-inbox-event-id`, `x-inbox-sent-at` e `x-inbox-internal-signature` verificável, body correspondente e janela temporal. Replays, assinatura adulterada ou expirada rejeitados.
- Verificar idempotência da chave `(workspace_id, event_key)` em `evolution_events`; mesmo evento entregue 2x não vira mensagem duplicada/auto-resposta duplicada. Evitar reenvio de integração quando operação externa já ocorreu e falhou o ACK local.
- Estados `queued`, `processing`, `failed`, `completed`, `dead_letter`; attempts máximo 5; CAS/claim condicional, backoff (`next_attempt_at`), falha abrupta/timeout e recuperação após lease vencido. Dois workers em paralelo -> no máximo um efetua side effect. Eventos `failed` com `next_attempt_at` no futuro **NÃO** podem executar antes do prazo; os registros legados sem timestamp também devem ter tratamento seguro.
- Configuração atual de cron: `netlify/functions/evolution-recover.mts`, a cada **10 minutos UTC** (`*/10 * * * *`), flag `ENABLE_EVOLUTION_RECOVERY=true`, `maxBatch=18`, `concurrency=3`. Grace de fila 90 segundos, lease stale 20 minutos. Não disparar sem ambiente isolado.
- **Importante:** Scheduled Functions não rodam automaticamente em Netlify Deploy Preview/branch; verificar manualmente via **Run now**, sem habilitar agendamento no site de produção não homologado. Netlify Functions agendadas têm limite próprio de runtime; aferir duração e métricas, garantir custo previsível.
- A função background `netlify/functions/evolution-events.mts` recebe assinatura de curta duração; request inválido não deve processar evento. As chamadas internas usam `trustedAppOrigin`, timeout 3s e bloqueio de redirect.
- Testar transição de status por leitura de `evolution_events` sintéticos e logs sem payload/segredos; **não** reprocessar conversas reais.

**GROQ:**

- Conectar em conta sandbox, verificar resposta manual por chat/lead e agente automático controlado; limites, modelo configurado, pausas e contexto por workspace; sem vazamento de dados entre tenants nem prompt acionado por mensagem não confiável.
- Forçar 401/429/5xx/timeouts e verificar que o sistema informa erro, não gera várias auto-respostas, não bloqueia worker indefinidamente e não expõe prompt/credenciais sensíveis em logs.

**RESEND transacional:**

- Domínio/remetente verificado no ambiente de teste. OTP/cadastro/login/recovery e e-mails administrativos devem chegar a caixas controladas, com `Idempotency-Key` estável; respostas 429/5xx e erro de rede levam no máximo **3 tentativas** no caminho transacional, sem mudar idempotency key; timeouts tratados. Redirecionamentos HTTP devem falhar e não enviar chave para novo host.
- Validar mensagens `system_events` e `notification_deliveries`, rejeição/erro do provedor, limite de envios e ausência de duplicação por reenvio de requisição.

**NEWSLETTER / RESEND BROADCASTS:**

- Editor por blocos, imagem, botão e vídeo com `thumbnail` HTTPS obrigatória; sanitização de HTML e links, subject/from validados; preview correto em mobile. Remetente/destinatários consentidos.
- Banco de `newsletter_campaigns`: somente `draft` pode ser editado; envio exige confirmação literal `ENVIAR NEWSLETTER`; lock `draft`→`queued` deve impedir envio paralelo; estado ambíguo após resposta do provedor deve ficar bloqueado para reconciliação, **NÃO** reenviar às cegas.
- Testar segmentos/contatos/opt-in/opt-out/unsubscribe sem inscrição automática de usuários. Enviar apenas para segmento isolado de 1–3 destinatários de teste autorizados; verificar o número de destinatários antes do disparo.
- Upload do endpoint via Function limitado a **3 MiB** (margem para payload Netlify), tipos JPEG/PNG/WebP/GIF/MP4/WebM, MIME + assinatura real de arquivo. Rejeitar extensão falsa, upload não autorizado e over-limit; Storage não aceita escrita pública. Arquivos grandes: não ampliar para 50 MB pelo mesmo endpoint sem mudar arquitetura (upload assinado direto, fora de escopo se não necessário).

**Critério:** cada integração tem pelo menos um sucesso com sandbox, um erro controlado e checagem de idempotência/autorização; custo e envio limitados. Não realizar stress test contra provedores pagos sem autorização.

**Referência oficial agendamento:** https://docs.netlify.com/build/functions/scheduled-functions/

### E5 — Preview Netlify, UI, performance e observabilidade (P1)

1. Preparar **Deploy Preview isolado**, `CONTEXT=deploy-preview`, `DEPLOY_PRIME_URL=https://...netlify.app`, Supabase staging + credenciais sandbox; `PUBLIC_APP_URL` canônica de produção pode existir mas **nenhum worker/link do preview pode enviar para esse domínio**. `trustedAppOrigin` escolhe `DEPLOY_PRIME_URL` no preview.
2. Executar workflow manual `.github/workflows/staging-smoke.yml` (sem segredos/sem envios reais) fornecendo URL preview. `vars.PRODUCTION_APP_URL` deve representar a origem de produção para o guard recusar esse host. `tests/staging-target-policy.ts` impede URL proibida.
3. Executar `TEST_BASE_URL=https://<preview>.netlify.app npm run test:integration` e revisar 401/403; **os testes presentes são anônimos** — não substituir E3 autenticado por eles.
4. Revalidar SSR/hidratação, imports client/server, páginas e API handlers após o build real, incluindo rotas geradas oficialmente pelo plugin TanStack.
5. Matriz UI: iPhone 320/360/390/430 px, tablet (~768/1024 px), desktop 1280/1440+, paisagem, altura curta, safe area, teclado iOS; menus e sidebars não podem cobrir ações, forms devem validar e preservar estado, loading/erro/empty, modais, scroll horizontal não intencional, toque e foco acessível.
6. Fluxos visuais: login/OTP/recovery; inbox/chat/busca/contatos; CRM kanban; follow-ups; configuração de empresa/membros/convites; troca de workspace; ADM global, editor de newsletter e upload. Não redesenhar componentes sem erro reproduzido.
7. Observabilidade: logs de Netlify Functions e erro por módulo, request IDs, contagens de `queued/failed/dead_letter`, filas estagnadas, e-mails falhos e agentes duplicados; nunca incluir tokens, chaves, corpos de conversas, números ou payload de mídia em logs. Definir alertas e limites de custos por serviço quando recursos já existirem; não contratar ferramenta paga sem autorização.
8. Segurança de cabeçalhos, CORS/Origin, cookies, cookies de sessão, secrets no bundle, rate limits e página de erro. Testar caminhos privados sem sessão e com sessão de outro workspace.
9. Healthcheck `GET /api/health`, 2xx apenas quando runtime básico está de pé; se implementado com status genérico, não confundir com prova de conectividade de todos os serviços.
10. Verificar publicação SSR da Netlify, Scheduled Function em listagem de Functions, Background Function em logs, configuração de `deploy-preview` e ajustes de rota sem sobrescrever produção.

**Critério:** preview navegável/SSR funcional, smoke HTTP aprovado, telas críticas sem falhas bloqueadoras e evidências (prints de teste **sem dados pessoais** e logs redigidos).

### E6 — Preparar promoção, rollback e aprovação (P0 do release, NÃO EXECUTAR AUTOMATICAMENTE)

**Pré-condições:** E1 + E2 + E3 + E4 + E5 como PASS para todos os critérios críticos. Se algo ainda BLOCKED, entrega código/relatório e **NÃO** promove.

1. Conferir `npm run audit:env` **somente em contexto de produção controlado**, sem imprimir env. `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` deve estar vazio após bootstrap; `INTEGRATION_VAULT_KEY` correto e estável, `AUTH_CRYPTO_SECRET` estável, `ENABLE_EVOLUTION_RECOVERY=true` apenas depois de homologar fila, Billing `false/false`.
2. Confirmar `SUPABASE_URL` e `VITE_SUPABASE_URL` apontam para mesmo ambiente aprovado; service role não é exposta ao browser. Não copiar env staging para produção.
3. Preparar **backup e restauração testada** do banco, armazenamento necessário e configurações; apontar último deploy íntegro/commit e plano de rollback Git/Netlify (com avaliação de compatibilidade das migrations). Definir migrações reversíveis/forward-fix quando necessário.
4. Aplicação de migrations ao vivo, rotação de segredos, reconfiguração de webhooks, troca de tráfego, lançamento de newsletter ou envios só com **aprovação explícita separada**; apresentar resumo de impacto, janela, riscos e plano de rollback antes de qualquer ação.
5. Confirmar status checks do GitHub e permissões de deploy Netlify, ambiente e segredos, dashboards, políticas de acesso, quotas e alertas.
6. Rodar smoke **não destrutivo** após publicação aprovada, confirmar Auth, health, SSR, filas/cron, RLS e taxas de erro; ter critério claro de rollback.

**Critério:** registro de aprovação do proprietário + gates críticos verdes + backup/rollback comprovados; se não autorizada, status final “CÓDIGO PREPARADO; PUBLICAÇÃO BLOQUEADA POR APROVAÇÃO” (não “em produção”).

---

## 3. VARIÁVEIS DE AMBIENTE — MATRIZ DE CONTROLE

**Não colocar valores reais neste documento, no ZIP ou em prints.** Nome, responsabilidade e escopo de configuração:

| Nome | Local/uso | Regra de segurança/validação |
|---|---|---|
| `VITE_SUPABASE_URL` | Front/build | URL do Supabase staging ou prod correspondente; pública |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Front/build | Chave publicável, nunca service_role |
| `VITE_SUPABASE_PROJECT_ID` | Front/build, se necessário | Ref do projeto correto; conferir compatibilidade com o cliente |
| `SUPABASE_URL` | Backend | Mesmo projeto de `VITE_SUPABASE_URL`; HTTPS |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Chave publicável, ambiente correto |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend **somente** | Nunca VITE_, browser ou logs |
| `AUTH_CRYPTO_SECRET` | Backend | Segredo estável >=32 caracteres aleatórios; assinaturas internas e Auth |
| `INTEGRATION_VAULT_KEY` | Backend | Base64 canônico de 32 bytes criptográficos; estável; não misturar variantes |
| `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` | Backend/bootstrap | Allowlist só durante primeiro bootstrap; remover depois; usuário verificado |
| `PUBLIC_APP_URL` | Backend/produção | Origem HTTPS canônica; sem user/password/path/porta/query |
| `CONTEXT` | Netlify | `deploy-preview`, `branch-deploy` ou `production`; conferido por `trustedAppOrigin` |
| `DEPLOY_PRIME_URL` | Netlify preview | Origem gerada pela Netlify; obrigatória no preview para callbacks internos |
| `PRODUCTION_APP_URL` | GitHub/teste smoke | URL real usada somente para *bloquear* smoke contra prod |
| `TEST_BASE_URL` | Testes HTTP | Deploy Preview isolado ou localhost de teste; nunca domínio produtivo |
| `EVOLUTION_API_URL` | Backend | Endpoint HTTPS da Evolution correta para o ambiente |
| `EVOLUTION_API_KEY` | Backend/cofre fallback | Segredo de saída, nunca browser |
| `EVOLUTION_WEBHOOK_TOKEN` | Backend/cofre fallback | Autenticação de entrada; não usar em querystring |
| `ENABLE_EVOLUTION_RECOVERY` | Backend/Netlify | `false` até validar recovery real no staging; `true` em produção só após autorização |
| `RESEND_API_KEY` | Backend/cofre fallback | Conta e domínio de teste nos previews |
| `RESEND_FROM_EMAIL` | Backend | Remetente validado; sandbox/produção separados |
| `GROQ_API_KEY` | Backend/cofre fallback | Agentes com modelos/quotas de teste nos previews |
| `GROQ_MODEL` | Backend | Modelo configurado pelo agente; validar disponibilidade |
| `SYSTEM_CRON_SECRET` / `_PREVIOUS` | Backend, se utilizado | Rotação do cron protegido, não expor nem misturar com Auth |
| `ENABLE_BILLING` | Backend | **false** no core |
| `VITE_ENABLE_BILLING` | Front | **false** no core |
| `INTEGRATION_TEST_ALLOWED_HOSTS` | Testes isolados, se usado | Apenas hosts explicitamente autorizados; nunca liberar arbitrariamente |

**Gates já existentes:** `npm run audit:env` (somente condições de produção) e `npm run audit:release`. Executar sem redirecionar o conteúdo das variáveis para logs.

**Atenção a ambiente econômico:** não é necessário criar novos secrets reais para testar parsing, mocks, lint, typecheck e build. Solicitar secrets sandbox **somente** na etapa de integração correspondente.

---

## 4. REGRA DE VALIDAÇÃO, ERROS E REINCIDÊNCIA (CHECKLIST TÉCNICO)

| Situação | Resposta desejada / prova |
|---|---|
| API privada sem bearer/sessão | 401, sem side effect |
| Autenticado sem permissão global/local | 403, ou 404 para recursos não enumeráveis |
| Cross-tenant por UUID | 403/404/0 registros, sem vazamento |
| OTP/challenge inválido | 400/401/429 consistente, sem login/alteração |
| OTP consumido/expirado | falha definitiva; nenhuma alteração e nenhuma reutilização |
| Last owner/superadmin | rejeição transacional consistente, inclusive com duas sessões paralelas |
| Webhook sem token válido | 401, sem salvar/reenviar evento |
| Webhook com rate limiter indisponível | 503, fail-closed; não aceitar bypass |
| Webhook request flood | 429 com retry informado quando suportado |
| Worker assinatura ausente/adulterada/vencida | não processa (validar logs de erro sem dados) |
| Dois workers mesmo evento | no máximo um claim válido e nenhum efeito externo duplicado |
| `next_attempt_at` futuro | não consumir até vencimento |
| Worker interrompido `processing` | recuperar após lease 20min, nunca antes |
| Falha com tentativas esgotadas | `dead_letter`; nenhuma repetição infinita |
| HTTP redirect de serviço com chave | falha segura; segredo não é reenviado |
| Resend rede/5xx/429 transitório | retry limitado e mesma chave de idempotência |
| Resend 4xx definitivo | não repetir cegamente |
| Newsletter envio concorrente/ambíguo | lock `draft`→`queued`; sem segundo disparo; reconciliar com provedor |
| Newsletter sem opt-in | não enviar nem inscrever automaticamente |
| Upload mídia falsa/maior que 3 MiB | HTTP erro claro; nenhum arquivo persistido |
| Storage `newsletter-media` | leitura pública só onde intencional; gravação restrita |
| Build Netlify com env faltando | gate produção FAIL sem imprimir segredo |
| Billing core | nenhuma rota/checkout ativo com flags false |
| Preview Netlify chamando produção | REJEITAR; link interno/convite deve ficar no preview |
| Migrations divergentes | BLOCKED/diagnóstico, não corrigir histórico vivo às cegas |

---

## 5. ARTEFATOS FINAIS E EVIDÊNCIAS — FORMATO OBRIGATÓRIO

O Work entregará, após executar o que estiver disponível:

1. `inboxos-release-validado-YYYY-MM-DD.zip`: **código completo** (sem `node_modules`, `dist`, `.env` reais nem dados privados); lockfile atualizado quando houver registry. Só nomear “validado” se os gates pertinentes passarem; senão “release-candidate”.
2. `inboxos-work-changes.patch`: diff revisável contra Fase 8. Reportar quantidade de arquivos adicionados/modificados e finalidades (sem segredos).
3. `INBOXOS_QA_FINAL.md`: **uma** matriz por gate com `PASS`/`FAIL`/`BLOCKED`, comando/etapa, data/hora, prova (trecho curto de log sanitizado, screenshot sem dados reais ou descrição verificável), regressão e risco restante.
4. `INBOXOS_ACOES_PROPRIETARIO.md`: **somente** decisões/acessos externos realmente indispensáveis, agrupadas uma vez; indicar custo aproximado se houver serviço pago, alternativa grátis e quais tarefas não dependem da decisão.
5. Resumo final de no máximo 10 linhas: o que mudou, o que passou, bloqueios reais, custo/ações que requerem dono, se há ou não autorização para produção. Não recontar Fases anteriores.

**Modelo da matriz (preencher):**

| Gate | Estado | Evidência mínima | Próximo passo se falhar |
|---|---|---|---|
| Node/npm/lock | BLOCKED | comando, saída sanitizada e versões | corrigir lock com npm real |
| npm ci | BLOCKED | exit code | resolver registry/compatibilidade |
| 149+ testes locais | PASS anterior; refazer após mudanças | total PASS/FAIL atual | corrigir regressões |
| release static audit | FAIL anterior (lock) | 0 divergências novas | regenerar lock |
| ESLint | BLOCKED | exit code | corrigir erros concretos |
| tsc --noEmit | BLOCKED | exit code | corrigir tipos concretos |
| Vite/Netlify build | BLOCKED | output dist/client + função SSR | corrigir bundle |
| Migrations staging | BLOCKED | lista e logs/DDL sintético | reconciliar histórico |
| 2-tenant/RBAC E2E | BLOCKED | matriz HTTP e resultado em DB | corrigir guards |
| Evolution/cron sandbox | BLOCKED | statuses/eventos sintéticos | corrigir fila |
| Groq/Resend/newsletter | BLOCKED | IDs de eventos de teste, sem PII | corrigir integração |
| Netlify preview/visual | BLOCKED | URL preview + prints redigidos | corrigir UI/runtime |
| Produção | NÃO AUTORIZADA | aprovação explícita em separado | não publicar |

**Regra:** a coluna “PASS anterior” **não** deve virar “PASS de homologação” sem executar o teste correspondente no ambiente certo.

---

## 6. ORDEM ECONÔMICA: O QUE O WORK REALMENTE PRECISA FAZER PRIMEIRO

| Ordem | Esforço esperado | Trabalho | Próxima etapa permitida |
|---|---|---|---|
| **1 (obrigatória)** | Baixo/médio | Corrigir lock e passar CI, tsc, lint, build **uma única vez por correção** | Só depois depurar runtime |
| 2 | Médio | Staging local e migrations; identificar diferenças reais, proteger owners/superadmins | Sem banco vivo |
| 3 | Médio | Smoke HTTP anônimo + testes autenticados mínimos de 2 tenants e ADM | Só contas sintéticas |
| 4 | Médio | Evolution sintética + recovery/cron `Run now` + idempotência | Só sandbox |
| 5 | Baixo/médio | Resend/Groq e newsletter apenas em destinatários testes, UI essencial | Sem campanhas amplas |
| 6 | Baixo | Consolidar QA, pacote, patch e decisões para aprovação | Não publicar automaticamente |

**O QUE NÃO PAGAR PARA O WORK REFAZER:** reconstrução do InboxOS, branding, landing page, arquitetura, interfaces inteiras, documentação histórica, 149 testes analisados um por um, análise genérica de “tudo que pode causar bugs”, reimplementação de cron, HMAC, cofre, OTP, newsletter, `fetchCredentialed` ou rotas existentes sem erro concreto.

---

## APÊNDICE A — INVENTÁRIO TÉCNICO DE ROTAS DA VERSÃO FASE 8

**Gerado pela leitura de `src/routes/api` do código-base atual.** Métodos encontrados por inspeção estática dos handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). A forma do caminho vem de `createFileRoute`; a **execução real** continua dependente do TanStack/Vite. Parâmetros dinâmicos devem ser substituídos por IDs sintéticos válidos em staging. Métodos não identificados estaticamente precisam ser conferidos no arquivo correspondente.

**73 arquivos API catalogados estaticamente, com 103 combinações método/rota detectadas.** Este inventário descreve caminhos e métodos potenciais, não comprova acesso HTTP real.

| Rota file-based | Métodos observados | Arquivo de implementação |
|---|---|---|
| `/api/admin/audit/` | GET | `src/routes/api/admin/audit/index.ts` |
| `/api/admin/integrations/` | GET, POST, PATCH | `src/routes/api/admin/integrations/index.ts` |
| `/api/admin/integrations/rotate/` | POST | `src/routes/api/admin/integrations/rotate/index.ts` |
| `/api/admin/integrations/test/` | POST | `src/routes/api/admin/integrations/test/index.ts` |
| `/api/admin/invitations/` | GET, POST, PATCH | `src/routes/api/admin/invitations/index.ts` |
| `/api/admin/me/` | GET | `src/routes/api/admin/me/index.ts` |
| `/api/admin/members/` | GET, PATCH | `src/routes/api/admin/members/index.ts` |
| `/api/admin/newsletter/audience/` | GET, POST | `src/routes/api/admin/newsletter/audience/index.ts` |
| `/api/admin/newsletter/` | GET, POST, PATCH | `src/routes/api/admin/newsletter/index.ts` |
| `/api/admin/newsletter/media/` | POST | `src/routes/api/admin/newsletter/media/index.ts` |
| `/api/admin/newsletter/send/` | POST | `src/routes/api/admin/newsletter/send/index.ts` |
| `/api/admin/overview/` | GET | `src/routes/api/admin/overview/index.ts` |
| `/api/admin/system-admins/` | GET, POST | `src/routes/api/admin/system-admins/index.ts` |
| `/api/admin/users/` | GET, PATCH | `src/routes/api/admin/users/index.ts` |
| `/api/admin/workspaces/` | GET, PATCH | `src/routes/api/admin/workspaces/index.ts` |
| `/api/agents/` | GET, POST, PATCH, DELETE | `src/routes/api/agents/index.ts` |
| `/api/agents/test` | POST | `src/routes/api/agents/test.ts` |
| `/api/auth/email-change/cancel` | POST | `src/routes/api/auth/email-change/cancel.ts` |
| `/api/auth/email-change/new/start` | POST | `src/routes/api/auth/email-change/new/start.ts` |
| `/api/auth/email-change/new/verify` | POST | `src/routes/api/auth/email-change/new/verify.ts` |
| `/api/auth/email-change/old/start` | POST | `src/routes/api/auth/email-change/old/start.ts` |
| `/api/auth/email-change/old/verify` | POST | `src/routes/api/auth/email-change/old/verify.ts` |
| `/api/auth/login/resend` | POST | `src/routes/api/auth/login/resend.ts` |
| `/api/auth/login/start` | POST | `src/routes/api/auth/login/start.ts` |
| `/api/auth/login/verify` | POST | `src/routes/api/auth/login/verify.ts` |
| `/api/auth/password/resend` | POST | `src/routes/api/auth/password/resend.ts` |
| `/api/auth/password/reset` | POST | `src/routes/api/auth/password/reset.ts` |
| `/api/auth/password/start` | POST | `src/routes/api/auth/password/start.ts` |
| `/api/auth/password/verify` | POST | `src/routes/api/auth/password/verify.ts` |
| `/api/auth/phone-change/start` | POST | `src/routes/api/auth/phone-change/start.ts` |
| `/api/auth/phone-change/verify` | POST | `src/routes/api/auth/phone-change/verify.ts` |
| `/api/auth/register/resend` | POST | `src/routes/api/auth/register/resend.ts` |
| `/api/auth/register/start` | POST | `src/routes/api/auth/register/start.ts` |
| `/api/auth/register/verify` | POST | `src/routes/api/auth/register/verify.ts` |
| `/api/auth/security/` | GET, POST | `src/routes/api/auth/security/index.ts` |
| `/api/billing/` | GET | `src/routes/api/billing/index.ts` |
| `/api/chats/$id/ai-state` | POST | `src/routes/api/chats/$id/ai-state.ts` |
| `/api/chats/$id/business-profile` | GET | `src/routes/api/chats/$id/business-profile.ts` |
| `/api/chats/$id/flags` | POST | `src/routes/api/chats/$id/flags.ts` |
| `/api/chats/$id/messages` | GET | `src/routes/api/chats/$id/messages.ts` |
| `/api/chats/$id/read` | POST | `src/routes/api/chats/$id/read.ts` |
| `/api/chats/$phone/pause` | POST | `src/routes/api/chats/$phone/pause.ts` |
| `/api/chats/$phone/presence` | POST | `src/routes/api/chats/$phone/presence.ts` |
| `/api/chats/$phone/resume` | POST | `src/routes/api/chats/$phone/resume.ts` |
| `/api/chats/` | GET | `src/routes/api/chats/index.ts` |
| `/api/chats/sync-pfp` | POST | `src/routes/api/chats/sync-pfp.ts` |
| `/api/company/` | GET, PATCH | `src/routes/api/company/index.ts` |
| `/api/company/logo` | POST | `src/routes/api/company/logo.ts` |
| `/api/crm/` | GET, POST, PATCH, DELETE | `src/routes/api/crm/index.ts` |
| `/api/crm/stages` | GET, POST, PATCH, DELETE | `src/routes/api/crm/stages.ts` |
| `/api/dashboard/` | GET | `src/routes/api/dashboard/index.ts` |
| `/api/events/` | GET | `src/routes/api/events/index.ts` |
| `/api/follow-up/` | GET, POST, PATCH, DELETE | `src/routes/api/follow-up/index.ts` |
| `/api/health` | GET | `src/routes/api/health.ts` |
| `/api/instances/$name/` | DELETE | `src/routes/api/instances/$name/index.ts` |
| `/api/instances/$name/qrcode` | GET, POST | `src/routes/api/instances/$name/qrcode.ts` |
| `/api/instances/` | GET, POST | `src/routes/api/instances/index.ts` |
| `/api/legal/status` | GET | `src/routes/api/legal/status.ts` |
| `/api/media/# INBOXOS — ESPECIFICAÇÃO COMPLETA DE FINALIZAÇÃO PARA CHATGPT WORK

**Versão:** Fase 8 — 02/10/2026  
**Projeto:** InboxOS (SaaS de atendimento WhatsApp, multi-tenant)  
**Entrada única:** `inboxos-fase8-preparado-para-work-2026-10-02.zip` (o arquivo entregue com este handoff)  
**Documento canônico:** `docs/WORK_HANDOFF_EXAUSTIVO_FASE8_2026-10-02.md`  
**Perfil de execução:** econômico; reparar somente erros reproduzidos, executar testes em lote, não repetir pesquisas/auditorias estáticas já concluídas.  
**Status:** código testado localmente; **NÃO homologado para produção**.  
**Decisão do proprietário:** manter o custo do Work e de infraestrutura no mínimo; não executar nada que cobre, envie mensagens reais ou altere produção sem autorização específica.

> **COMANDO-BASE PARA O WORK:** Use apenas o ZIP Fase 8 como fonte de código. Leia primeiro esta página e os quatro arquivos indicados na E0. **Execute** as etapas, não apenas produza um plano. Corrija o mínimo que for necessário, produza testes que comprovem cada correção e pare nas ações irreversíveis ou que exijam aprovação. Entregue um ZIP novo e uma matriz PASS/FAIL/BLOCKED com evidências. Este handoff contém o que precisa ser feito — não recomece a investigação de Fases 1–7.

---

## 0. OBJETIVO, LIMITES E CONTRATO DE ENTREGA

### 0.1 Resultado desejado

1. Dependências coerentes e reprodutíveis (`package.json` + `package-lock.json`) e um **build de produção real** com adaptador oficial TanStack Start / Netlify.
2. Testes unitários, lint, typecheck, geração real da árvore de rotas e build aprovados e documentados; corrigir erros que os gates revelarem.
3. Uma base **staging** separada, com SQL/regras equivalentes às aplicadas no sistema, incluindo migrations e permissões; nenhum reset da base viva.
4. Testes E2E e de APIs com autenticação e dados sintéticos para fluxos críticos de segurança, isolamento por workspace e administração global.
5. Verificação de Evolution API, cron, workers, Groq, Resend, Storage e newsletter utilizando **somente contas/instâncias/teste consentidas**; sem campanhas ou mensagens reais.
6. Deploy Preview isolado, UI funcional nos tamanhos-alvo, registro de erros, rollback preparado. A produção somente poderá ser promovida após gates verdes **e aprovação explícita**.

### 0.2 NÃO FAZER

- **NÃO** reconstruir do zero, trocar framework, inventar arquitetura, substituir integrações, modificar branding/design global, aumentar escopo ou propor Billing neste core.
- **NÃO** alterar sistemas ativos, executar `supabase db reset`, `supabase db push`, `migration repair`, DDL, truncates, deletes ou inserts de dados de teste no **Supabase vivo** sem autorização posterior, escopo e backup. Consultas somente leitura são permitidas quando necessárias para comparação.
- **NÃO** publicar em produção, atualizar webhooks reais, mudar DNS, enviar WhatsApp/e-mails reais, migrar contatos, ativar automações reais ou criar plano de cobrança sem autorização explícita do proprietário.
- **NÃO** usar dados reais de conversas, contatos, mídia, telefones ou credenciais em logs, prints, repositório, testes e relatórios.
- **NÃO** inventar hashes/integridades de dependências, burlar ESLint/TS/CI, colocar `// @ts-ignore` em massa, desativar RLS, afrouxar autenticação ou retornar HTTP 200 para esconder falhas.
- **NÃO** mudar o segredo do cofre criptografado (`INTEGRATION_VAULT_KEY`) de um ambiente com dados sem procedimento de recriptografia/rotação, pois isso inviabiliza descriptografar segredos persistidos.
- **NÃO** misturar esta variante com outras do dia 01/10 que usam `SYSTEM_VAULT_KEY`, `INBOXOS_VAULT_KEY` ou `INTEGRATIONS_MASTER_KEY`. A variável correta desta base é **`INTEGRATION_VAULT_KEY`**, em base64 de **exatamente 32 bytes**.
- **NÃO** divulgar valores de `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_CRYPTO_SECRET`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `GROQ_API_KEY` nem material criptográfico.

### 0.3 Prioridade de custo e estratégia operacional

- Executar **uma sequência de comandos por etapa**, capturando logs/exit codes sem imprimir segredos. Não gastar créditos reanalisando centenas de arquivos já auditados.
- **E1 vem antes de qualquer alteração adicional no código.** Sem `npm ci`, lint, tsc e build reais, não há justificativa para corrigir componentes aleatórios.
- Preferir ambiente local/CI efêmero e testes com mocks/sandbox a provisionar novos serviços pagos. Só criar Supabase staging ou deploy temporário se um serviço gratuito/ambiente isolado existente não suprir o teste.
- Ao encontrar ausência de acesso (npm, GitHub, Netlify, Supabase staging, Evolution sandbox, Groq sandbox, Resend de teste), registrar **uma única vez** como BLOCKED, guardar o comando e seguir tarefas independentes. Agrupar todas as solicitações de acesso/autorizações em uma única pergunta ao proprietário, sem repetir.
- Não refazer 149 testes individualmente. Rodar `npm test` após mudança relevante e novamente ao final; rodar testes direcionados apenas durante diagnóstico.
- Corrigir somente `FAIL` reproduzido ou falha de segurança demonstrada. Manter funcionalidades e layout existentes.
- Concluir entregando **1 ZIP final**, **1 patch**, **1 relatório enxuto de evidências** e **1 lista curta de ações do proprietário**, caso existam. Não gerar vários relatórios redundantes.

---

## 1. ESTADO CONHECIDO DO CÓDIGO (NÃO PRECISA REDESCOBRIR)

### 1.1 Tecnologias, implantação e parâmetros reais

| Camada | Implementação existente | Observações |
|---|---|---|
| UI | React 19 + TypeScript + TanStack React Router/Start + Vite 8 | App file-based; `src/routes`, `src/routeTree.gen.ts` |
| Dependências | npm 10.9.2; Node **22.16.0**, projeto exige >=22.12.0 | `.github/workflows/release-gates.yml`, `netlify.toml` |
| Hospedagem | Netlify | `netlify.toml` usa `npm run build:gated` e `publish = "dist/client"` |
| Adaptador | `@netlify/vite-plugin-tanstack-start@1.3.19` | Declarado no `package.json`, **ausente/divergente no lockfile** |
| Banco/identidade | Supabase Postgres/Auth/Storage; servidor com `service_role` | `supabase/migrations`, `src/integrations/supabase`, `src/server/middleware` |
| WhatsApp | Evolution API | webhook + `evolution_events`, funções background e recuperação programada |
| IA | Groq | agentes por workspace/conexão; preservar proteção contra respostas duplicadas |
| E-mail | Resend | OTP/transacional, newsletter/broadcasts, idempotência e controle de audiência |
| ADM | Control Plane global separado dos workspaces | `superadmin/operator/support/auditor`, cofre criptografado, auditoria |
| Multi-tenant | workspace no servidor + guards relacionais/RLS | Testar autorização com 2 tenants; não confiar só no ID enviado pelo browser |
| Billing | **Intencionalmente OFF** | `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`; fora do release principal |

**Código-base canônico:** o ZIP Fase 8, que inclui correções das Fases 1–8. Evitar abrir ZIPs mais antigos ou reler atas extensas. As especificações antigas em `/docs` servem como referência de comportamento, mas testes e runtime da versão atual prevalecem.

### 1.2 Evidências existentes, não confundir com homologação

- `npm test`: **149/149 aprovados** nesta revisão local. Incluem testes estáticos e unitários; não certificam E2E real.
- `npm run audit:release`: **258** arquivos TS/TSX/MTS analisados sem falha de **sintaxe**, **0 imports locais ausentes**, **83 rotas representadas**, Billing protegido. É pré-flight **estático** e continua **FAIL** por lockfile.
- Divergências de dependências encontradas: **6**:
  1. `@lovable.dev/mcp-js` apenas no lock raiz;
  2. `@sentry/cloudflare` apenas no lock raiz;
  3. `@netlify/vite-plugin-tanstack-start` divergente/ausente no lock raiz;
  4. entrada instalada de `@netlify/vite-plugin-tanstack-start` ausente no lock;
  5. `@lovable.dev/vite-tanstack-config` apenas no lock raiz;
  6. `nitro` apenas no lock raiz.
- `npm install`/`npm ci` bloqueados anteriormente por `EAI_AGAIN`/`ENOTCACHED` no executor; sem `node_modules` completo. **NÃO** afirmar lint/tsc/build aprovados, nem que os provedores foram integrados de ponta a ponta.
- Supabase vivo foi consultado **somente leitura**; Security Advisor sem alertas na última consulta, mas isso não prova conformidade integral. O histórico SQL remoto e local **não está 100% alinhado**.
- O código da Fase 8 bloqueia redirects em `fetchCredentialed`, usa timeouts e retry limitado do Resend com mesma idempotency key, e reforça Evolution worker e origens confiáveis.
- Arquivos de evidência: `docs/QA_EVIDENCIAS_RELEASE.md` e `docs/WORK_HANDOFF_MINIMO_FASE7_2026-10-02.md` (este documento Fase 8 substitui o handoff Fase 7).

### 1.3 Recursos e pontos de entrada — caminhos exatos

| Finalidade | Arquivos/caminhos |
|---|---|
| Dependências e compilação | `package.json`, `package-lock.json`, `vite.config.ts`, `netlify.toml`, `tsconfig.json`, `eslint.config.js` |
| Preparar build | `scripts/prepare-production-build.sh` |
| Gates Netlify | `scripts/netlify-build-gate.mjs`, `scripts/audit-release-readiness.mjs`, `scripts/audit-production-env.mjs`, `scripts/lib/release-validation.mjs` |
| CI GitHub | `.github/workflows/release-gates.yml`, `.github/workflows/staging-smoke.yml` |
| Integração HTTP não autenticada | `tests/integration.test.ts`, `scripts/validate-staging-target.mjs`, `tests/staging-target-policy.ts` |
| Auth e sessão | `src/server/auth/*.server.ts`, `src/server/middleware/*.ts`, `src/server/auth-context.ts`, `src/routes/api/auth/**` |
| Administração global | `src/server/admin/*.server.ts`, `src/routes/api/admin/**`, `src/server/admin/bootstrap-policy.ts` |
| Evolution/Webhook | `src/routes/api/public/webhooks/evolution.ts`, `src/server/evolution/event-inbox.ts`, `src/server/evolution/background-dispatch.ts`, `src/server/evolution/webhook-rate-limit.ts` |
| Recuperação agendada | `netlify/functions/evolution-recover.mts`, `netlify/functions/evolution-events.mts`, `src/server/evolution/recovery.server.ts`, `recovery-policy.ts` |
| Origens seguras | `src/server/security/trusted-app-origin.ts`, `src/server/security/credentialed-fetch.ts` |
| Newsletter | `src/server/admin/newsletter.server.ts`, `newsletter-render.ts`, `media-signatures.ts`, `src/lib/newsletter-upload-policy.ts` |
| Resend | `src/server/email/resend.server.ts`, `resend-retry-policy.ts`, `delivery.server.ts` |
| Cofre de integrações | `src/server/admin/integration-vault.server.ts`, `vault-crypto.ts` |
| CRM e automação | `src/server/product/workspace-product.server.ts`, `src/routes/api/crm/**`, `src/routes/api/agents/**`, `src/routes/api/follow-up/**` |
| Migrations | `supabase/migrations/*.sql`; atenção a `20261001134743_...` e `20261001230000_...` |
| Relatórios | `docs/FASE6_EVOLUTION_RECOVERY_2026-10-02.md`, `docs/FASE7_ORIGENS_E_RETRY_2026-10-02.md`, `docs/QA_EVIDENCIAS_RELEASE.md` |

---

## 2. EXECUÇÃO PASSO A PASSO, COM COMANDOS E CRITÉRIOS

### E0 — Preservar a base e confirmar execução (P0, barata, 1 passagem)

**Ação:**

1. Descompactar o ZIP Fase 8 em uma pasta limpa. Confirmar que o projeto raiz possui `package.json`, `package-lock.json`, `netlify.toml`, `src`, `tests`, `scripts`, `supabase`, `.github`.
2. Registrar SHA-256 do ZIP e a lista de alterações versionadas em uma branch privada; não fazer push/deploy automático antes de CI.
3. Verificar Node/npm e se há acesso ao registry oficial; sem repetir checagens de rede em loop.
4. Ler **somente** `package.json`, `scripts/prepare-production-build.sh`, `scripts/audit-release-readiness.mjs`, `docs/QA_EVIDENCIAS_RELEASE.md` e este handoff. Consultar outros arquivos conforme diagnóstico.
5. Garantir que nenhum `.env` real nem chave privada entrou no ZIP. `.env.example` e `.env.netlify.example` são placeholders; jamais comitar valores reais.

**Comandos:**

```bash
node --version
npm --version
npm config get registry
node -p "require('./package.json').name"
node scripts/netlify-build-gate.mjs --plan
```

**PASS:** a fonte canônica foi identificada, os arquivos estão íntegros e a branch/snapshot está preservado. **BLOCKED:** acesso GitHub não disponível (trabalhar em cópia local e entregar ZIP). Não precisa pedir credenciais para E0/E1.

### E1 — Corrigir lockfile e certificar o build real (P0, PRIMEIRO BLOQUEADOR)

**Problema reproduzido:** `package.json` e lockfile divergentes; dependências Netlify/TanStack e ferramentas não instaladas. Parser TS sem erros não equivale a `tsc` nem bundle completo.

**Execução obrigatória, em Node 22.16.0 / npm 10.9.2 com rede:**

```bash
# Execute em ambiente confiável; este script não publica nem modifica banco.
bash scripts/prepare-production-build.sh

# O script executa, nesta ordem:
# npm install --package-lock-only --ignore-scripts --no-audit --no-fund
# npm ci --include=dev --include=optional --no-audit --no-fund
# npm test
# npm run audit:release
# npm run lint
# npx --no-install tsc --noEmit
# npm run build
```

**Tarefas para corrigir caso haja FAIL:**

1. Atualizar o lockfile **somente via npm oficial**; conferir diff do `package-lock.json` para remover as quatro dependências diretas antigas e incluir o adaptador Netlify `1.3.19` com integridades reais. Preservar os `overrides` existentes (inclusive `rolldown`) se ainda válidos; não mexer em versões sem necessidade.
2. Repetir `npm ci` para provar instalação reprodutível em ambiente limpo. Se erro de peer dependency, investigar versões do TanStack/React/Vite e resolver a incompatibilidade **documentando a alteração**. Não usar `--force`/`--legacy-peer-deps` como solução permanente sem justificativa e teste.
3. Executar lint; corrigir warnings/errors reais por módulo sem suprimir regras globalmente. Priorizar segurança, lógica e imports. O legado tem `any` e formatação inconsistente; refatorar gradualmente e somente o necessário para gate, evitando alteração de comportamento.
4. Executar `npx --no-install tsc --noEmit`, corrigir erros verdadeiros, conferir `vite/client` e tipos de funções Netlify. Se necessário, alinhar versões na combinação mínima, não fazer atualização geral de dependências.
5. Executar Vite/Netlify build e confirmar estrutura em `dist/client` e empacotamento do handler SSR para Netlify; usar o adaptador oficial presente em `vite.config.ts`.
6. Comparar `src/routeTree.gen.ts` antes/depois do build e confirmar que a regeneração oficial mantém as rotas esperadas, sem API desaparecida ou colisões.
7. Confirmar gate CI no `.github/workflows/release-gates.yml`; **não** publicar com testes desativados. Se rodar em Netlify, `netlify.toml` já utiliza `npm run build:gated` (testes, auditoria, lint, TypeScript e build; no contexto `production` inclui também auditoria de ENV).
8. Depois do build, iniciar localmente (`npm run dev`, ou teste do bundle SSR apropriado) e acessar a página inicial + `GET /api/health`; não usar chaves de produção.

**Critérios de aceite:** instalação limpa sem workaround inseguro; `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build` **todas exit code 0**; bundle publicado em `dist/client`; output SSR do adaptador verificável; nenhum segredo exposto no frontend; `package-lock.json` versionado e coerente; logs com comandos e resultados, **sem chaves**.

**Se bloqueado por DNS:** registrar último comando/erro `EAI_AGAIN` ou `ENOTCACHED` e seguir E2/E3 sem insistir. Não criar integridades fictícias. Não marcar build PASS.

**Fonte oficial (verificar se necessário):** https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/

### E2 — Banco de dados STAGING, migrations e segurança (P0; sem mutações no vivo)

**Dependência:** staging/ambiente local limpo ou projeto Supabase de teste, nunca o banco ativo. Preferir Postgres/Supabase local via CLI/Docker se isso evitar uma instância paga; usar um projeto staging remoto apenas para Auth, Storage, Netlify e integrações quando necessário.

**Reconciliação obrigatória:**

1. Levantar o histórico local em `supabase/migrations/` e confrontar com `supabase_migrations.schema_migrations` **no staging**, registrando tabelas, funções, triggers, constraints, índices e policies reais.
2. Existem migrations **já registradas no banco vivo** que exigem comparação com os arquivos locais: `20261001001324_atomic_email_challenge_failure_limit`, `20261001134743_atomic_workspace_owner_transfer`, `20260930234620_guard_last_active_superadmin` (a consulta anterior encontrou esse timestamp); **não presumir que todas estejam reproduzidas localmente**.
3. A migration local `20261001230000_protect_last_privileged_members.sql` foi criada na fase de segurança, **não foi aplicada no banco vivo**. Conferir a ordem de execução e simular apenas em staging. Ela acrescenta guards transacionais de último owner, último superadmin e suspensão global.
4. Revisar especialmente que a função `transfer_workspace_ownership(uuid,uuid,uuid)` seja `security invoker`, que `EXECUTE` permaneça apenas para `service_role` e que `anon`/`authenticated` não consigam invocá-la. Verificar concorrência com guard por advisory transaction lock e row locks.
5. RLS: `workspace_members`, `workspaces`, `system_admins`, `system_user_controls`, `newsletter_*`, `evolution_events`, `chats`, `messages`, CRM e agentes não podem entregar/alterar registros de outro tenant; não confiar no workspace enviado pelo cliente.
6. `storage.buckets` / `storage.objects`: newsletter-media pode ter leitura pública para ativos publicados, mas **nunca escrita pública**. Validar MIME aceitos, limite e escrita apenas via serviço autenticado autorizado. Não publicar mídia sensível de conversas em bucket público.
7. Testar idempotência/resultado das migrations num banco descartável; backfill de dados sintéticos e índices exclusivos; comparar schema depois da sequência.
8. Rodar Security Advisor e Performance Advisor. Security com **0 alertas novos**; Performance INFO deve ser registrado sem apagar índice útil por dedução.
9. Confrontar qualquer DDL/trigger antigo com o SQL efetivamente aplicado para não criar dois guards conflitantes. `migration repair` só corrige histórico, não executa SQL: usar unicamente se confirmado por inspeção e **apenas no staging**, como parte de reconciliação versionada.

**Comandos seguros de diagnóstico (apenas ambiente correto):**

```bash
supabase --version
supabase --help
supabase migration --help
supabase migration list --local
# Para staging remoto, conferir cuidadosamente qual projeto está vinculado:
supabase migration list --linked
# Sem db reset/db push/repair no vivo.
```

**Consultas SQL SOMENTE LEITURA exemplares:**

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public'
 and table_name in ('evolution_events','workspace_members','system_admins','email_challenges')
 order by table_name, ordinal_position;
select schemaname, tablename, policyname, cmd, roles
 from pg_policies where schemaname in ('public','storage')
 order by schemaname,tablename,policyname;
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname;
```

**Matriz de concorrência obrigatória em staging** (dados sintéticos, duas sessões independentes):

- Dois owners tentam se remover/rebaixar/suspender em paralelo; nunca terminar com zero owner ativo; uma das operações deve falhar atomicamente com 409/erro de integridade esperado.
- Dois superadmins tentam se desativar/rebaixar/suspender em paralelo; nunca terminar sem superadmin ativo; proteção deve abranger suspensão em `system_user_controls`, não apenas status da linha de `system_admins`.
- Transferência owner A→B válida mantém dono, membro alvo e trilha de auditoria. Transferência inválida/cross-workspace ou para inativo não promove ninguém.
- Sessão revogada não acessa API no próximo request protegido; usuário/workspace suspenso não consegue usar endpoints privados; auditor global só lê, suporte não executa ações de superadmin.
- Duas empresas A e B com usuários/testes distintos: acesso cruzado por UUID (IDOR/BOLA), chat, mídia, contatos, agentes, CRM, follow-up, convite e export deve retornar 403/404 ou vazio, **nunca dados B**.
- Senha/OTP: desafios expirados, bloqueados, consumidos, com código incorreto ou reutilizados não podem completar ação; concorrência usa consumo único.

**Critério de aceite:** staging reconstituível, migrations sem erro e com histórico consistente, RLS/privileged procedures verificados, testes negativos de dois tenants e de concorrência PASS; nenhum comando mutante executado no vivo.

**Fontes oficiais:** https://supabase.com/docs/reference/cli/supabase-migration-list ; https://supabase.com/docs/guides/deployment/database-migrations

### E3 — HTTP, autenticação, perfis e ADM (P0)

**Estado:** `tests/integration.test.ts` hoje testa principalmente acesso **anônimo** (401/403), e **não prova** todas as operações autenticadas. Adicionar/rodar testes autorizados com contas sintéticas em staging, cobrindo rotas listadas no apêndice de inventário.

**Cenários obrigatórios de identidade e segurança:**

- Cadastro PF/PJ: dados válidos, inválidos, duplicados, regras legais, OTP, confirmação, cooldown, limite por usuário/desafio/IP confiável, erro do Resend. Códigos nunca aparecem em resposta/log.
- Login: credenciais corretas/incorretas, OTP e resend, contas bloqueadas, usuário sem confirmação, múltiplos dispositivos, sessão expirada, token adulterado, `Authorization` inválido, logout/revogação -> próxima requisição recebe 401.
- Recuperação de senha: `start/verify/reset`, hash do desafio revalidado, limites, expiração, autorização consumida uma única vez, token usado em paralelo -> só uma mudança; senha antiga negada conforme requisito de mudança.
- Alteração e-mail: confirmação do e-mail antigo e do novo, cancelamento, tentativa de trocar depois da expiração, código errado, reutilização e concorrência. Alteração de telefone: mesma disciplina de desafio.
- Workspace: criação/ativação, troca de workspace, último owner, papéis locais, membros, convites (criar, listar, aceitar, revogar, expirar, aceitar 2x), remoção e reativação. Links de convite devem usar `trustedAppOrigin` e nunca Host/X-Forwarded-Host fornecidos pelo cliente.
- ADM global: `system_admins` e `workspace_members` são autorizações **diferentes**; workspace owner NÃO vira superadmin; bootstrap inicial apenas com e-mail confirmado e allowlist do servidor. Após criar o primeiro admin, fechar/remover `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` antes de produção.
- Testar superadmin/operator/support/auditor e usuário comum em GET/POST/PATCH/ações sensíveis. Esperados: 401 sem sessão; 403 sem papel; 400 payload inválido; 409 conflito/concorrência; 429 rate limit; 503 dependência indisponível; 200/201 somente quando autorizado. **Alguns endpoints podem retornar 404 no lugar de 403 para evitar enumeração — respeitar contrato real.**
- Cofre: criação/rotação/disable/enable das chaves Evolution/Groq/Resend e custom, máscara no GET, ciphertext nunca retornado, chave velha inválida quando rotacionada; fallback ENV apenas nas condições previstas; testar segredo ausente/corrompido sem expor material. Chave mestra server-only.
- Testar integridade de sessão e headers CSRF/origin; envio cross-site anônimo não deve iniciar autenticação ou alteração de recursos.
- Monitorar RLS no banco, eventos de auditoria por operação crítica e resposta HTTP consistente.

**APIs e áreas essenciais:** autenticação `/api/auth/*`, `admin/*`, workspaces, chats, messages, media, CRM, follow-up, agents, instances, dashboard, events, profile e company. **Não supor que os 83 caminhos são 83 métodos:** inventário detalhado encontra-se no Apêndice A.

**Critério:** cada cenário crítico tem request autenticado, estado esperado e consulta do resultado no staging; todos PASS ou BLOCKED motivado. O smoke não pode mandar tráfego para produção.

### E4 — Integrações externas, fila e jobs (P0, custo limitado)

**EVOLUTION API (instância de teste somente):**

- Criar conexão de teste sem usar WhatsApp comercial/contatos reais. QR, conectar/desconectar/reconectar, envio/recepção de texto; grupo, contato, mídia, mensagem com quote, reação, edição, exclusão, histórico e atualização de avatar. Respostas devem ficar no workspace certo.
- Verificar token de webhook na validação de entrada, credencial inválida 401, body inválido 400, instância não cadastrada 404, flood 429 e falha do limitador 503. Chave no URL/query **não é aceitável**.
- Webhook externo não pode se declarar worker apenas com `x-inbox-queue-consumer`; o worker exige `x-inbox-event-id`, `x-inbox-sent-at` e `x-inbox-internal-signature` verificável, body correspondente e janela temporal. Replays, assinatura adulterada ou expirada rejeitados.
- Verificar idempotência da chave `(workspace_id, event_key)` em `evolution_events`; mesmo evento entregue 2x não vira mensagem duplicada/auto-resposta duplicada. Evitar reenvio de integração quando operação externa já ocorreu e falhou o ACK local.
- Estados `queued`, `processing`, `failed`, `completed`, `dead_letter`; attempts máximo 5; CAS/claim condicional, backoff (`next_attempt_at`), falha abrupta/timeout e recuperação após lease vencido. Dois workers em paralelo -> no máximo um efetua side effect. Eventos `failed` com `next_attempt_at` no futuro **NÃO** podem executar antes do prazo; os registros legados sem timestamp também devem ter tratamento seguro.
- Configuração atual de cron: `netlify/functions/evolution-recover.mts`, a cada **10 minutos UTC** (`*/10 * * * *`), flag `ENABLE_EVOLUTION_RECOVERY=true`, `maxBatch=18`, `concurrency=3`. Grace de fila 90 segundos, lease stale 20 minutos. Não disparar sem ambiente isolado.
- **Importante:** Scheduled Functions não rodam automaticamente em Netlify Deploy Preview/branch; verificar manualmente via **Run now**, sem habilitar agendamento no site de produção não homologado. Netlify Functions agendadas têm limite próprio de runtime; aferir duração e métricas, garantir custo previsível.
- A função background `netlify/functions/evolution-events.mts` recebe assinatura de curta duração; request inválido não deve processar evento. As chamadas internas usam `trustedAppOrigin`, timeout 3s e bloqueio de redirect.
- Testar transição de status por leitura de `evolution_events` sintéticos e logs sem payload/segredos; **não** reprocessar conversas reais.

**GROQ:**

- Conectar em conta sandbox, verificar resposta manual por chat/lead e agente automático controlado; limites, modelo configurado, pausas e contexto por workspace; sem vazamento de dados entre tenants nem prompt acionado por mensagem não confiável.
- Forçar 401/429/5xx/timeouts e verificar que o sistema informa erro, não gera várias auto-respostas, não bloqueia worker indefinidamente e não expõe prompt/credenciais sensíveis em logs.

**RESEND transacional:**

- Domínio/remetente verificado no ambiente de teste. OTP/cadastro/login/recovery e e-mails administrativos devem chegar a caixas controladas, com `Idempotency-Key` estável; respostas 429/5xx e erro de rede levam no máximo **3 tentativas** no caminho transacional, sem mudar idempotency key; timeouts tratados. Redirecionamentos HTTP devem falhar e não enviar chave para novo host.
- Validar mensagens `system_events` e `notification_deliveries`, rejeição/erro do provedor, limite de envios e ausência de duplicação por reenvio de requisição.

**NEWSLETTER / RESEND BROADCASTS:**

- Editor por blocos, imagem, botão e vídeo com `thumbnail` HTTPS obrigatória; sanitização de HTML e links, subject/from validados; preview correto em mobile. Remetente/destinatários consentidos.
- Banco de `newsletter_campaigns`: somente `draft` pode ser editado; envio exige confirmação literal `ENVIAR NEWSLETTER`; lock `draft`→`queued` deve impedir envio paralelo; estado ambíguo após resposta do provedor deve ficar bloqueado para reconciliação, **NÃO** reenviar às cegas.
- Testar segmentos/contatos/opt-in/opt-out/unsubscribe sem inscrição automática de usuários. Enviar apenas para segmento isolado de 1–3 destinatários de teste autorizados; verificar o número de destinatários antes do disparo.
- Upload do endpoint via Function limitado a **3 MiB** (margem para payload Netlify), tipos JPEG/PNG/WebP/GIF/MP4/WebM, MIME + assinatura real de arquivo. Rejeitar extensão falsa, upload não autorizado e over-limit; Storage não aceita escrita pública. Arquivos grandes: não ampliar para 50 MB pelo mesmo endpoint sem mudar arquitetura (upload assinado direto, fora de escopo se não necessário).

**Critério:** cada integração tem pelo menos um sucesso com sandbox, um erro controlado e checagem de idempotência/autorização; custo e envio limitados. Não realizar stress test contra provedores pagos sem autorização.

**Referência oficial agendamento:** https://docs.netlify.com/build/functions/scheduled-functions/

### E5 — Preview Netlify, UI, performance e observabilidade (P1)

1. Preparar **Deploy Preview isolado**, `CONTEXT=deploy-preview`, `DEPLOY_PRIME_URL=https://...netlify.app`, Supabase staging + credenciais sandbox; `PUBLIC_APP_URL` canônica de produção pode existir mas **nenhum worker/link do preview pode enviar para esse domínio**. `trustedAppOrigin` escolhe `DEPLOY_PRIME_URL` no preview.
2. Executar workflow manual `.github/workflows/staging-smoke.yml` (sem segredos/sem envios reais) fornecendo URL preview. `vars.PRODUCTION_APP_URL` deve representar a origem de produção para o guard recusar esse host. `tests/staging-target-policy.ts` impede URL proibida.
3. Executar `TEST_BASE_URL=https://<preview>.netlify.app npm run test:integration` e revisar 401/403; **os testes presentes são anônimos** — não substituir E3 autenticado por eles.
4. Revalidar SSR/hidratação, imports client/server, páginas e API handlers após o build real, incluindo rotas geradas oficialmente pelo plugin TanStack.
5. Matriz UI: iPhone 320/360/390/430 px, tablet (~768/1024 px), desktop 1280/1440+, paisagem, altura curta, safe area, teclado iOS; menus e sidebars não podem cobrir ações, forms devem validar e preservar estado, loading/erro/empty, modais, scroll horizontal não intencional, toque e foco acessível.
6. Fluxos visuais: login/OTP/recovery; inbox/chat/busca/contatos; CRM kanban; follow-ups; configuração de empresa/membros/convites; troca de workspace; ADM global, editor de newsletter e upload. Não redesenhar componentes sem erro reproduzido.
7. Observabilidade: logs de Netlify Functions e erro por módulo, request IDs, contagens de `queued/failed/dead_letter`, filas estagnadas, e-mails falhos e agentes duplicados; nunca incluir tokens, chaves, corpos de conversas, números ou payload de mídia em logs. Definir alertas e limites de custos por serviço quando recursos já existirem; não contratar ferramenta paga sem autorização.
8. Segurança de cabeçalhos, CORS/Origin, cookies, cookies de sessão, secrets no bundle, rate limits e página de erro. Testar caminhos privados sem sessão e com sessão de outro workspace.
9. Healthcheck `GET /api/health`, 2xx apenas quando runtime básico está de pé; se implementado com status genérico, não confundir com prova de conectividade de todos os serviços.
10. Verificar publicação SSR da Netlify, Scheduled Function em listagem de Functions, Background Function em logs, configuração de `deploy-preview` e ajustes de rota sem sobrescrever produção.

**Critério:** preview navegável/SSR funcional, smoke HTTP aprovado, telas críticas sem falhas bloqueadoras e evidências (prints de teste **sem dados pessoais** e logs redigidos).

### E6 — Preparar promoção, rollback e aprovação (P0 do release, NÃO EXECUTAR AUTOMATICAMENTE)

**Pré-condições:** E1 + E2 + E3 + E4 + E5 como PASS para todos os critérios críticos. Se algo ainda BLOCKED, entrega código/relatório e **NÃO** promove.

1. Conferir `npm run audit:env` **somente em contexto de produção controlado**, sem imprimir env. `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` deve estar vazio após bootstrap; `INTEGRATION_VAULT_KEY` correto e estável, `AUTH_CRYPTO_SECRET` estável, `ENABLE_EVOLUTION_RECOVERY=true` apenas depois de homologar fila, Billing `false/false`.
2. Confirmar `SUPABASE_URL` e `VITE_SUPABASE_URL` apontam para mesmo ambiente aprovado; service role não é exposta ao browser. Não copiar env staging para produção.
3. Preparar **backup e restauração testada** do banco, armazenamento necessário e configurações; apontar último deploy íntegro/commit e plano de rollback Git/Netlify (com avaliação de compatibilidade das migrations). Definir migrações reversíveis/forward-fix quando necessário.
4. Aplicação de migrations ao vivo, rotação de segredos, reconfiguração de webhooks, troca de tráfego, lançamento de newsletter ou envios só com **aprovação explícita separada**; apresentar resumo de impacto, janela, riscos e plano de rollback antes de qualquer ação.
5. Confirmar status checks do GitHub e permissões de deploy Netlify, ambiente e segredos, dashboards, políticas de acesso, quotas e alertas.
6. Rodar smoke **não destrutivo** após publicação aprovada, confirmar Auth, health, SSR, filas/cron, RLS e taxas de erro; ter critério claro de rollback.

**Critério:** registro de aprovação do proprietário + gates críticos verdes + backup/rollback comprovados; se não autorizada, status final “CÓDIGO PREPARADO; PUBLICAÇÃO BLOQUEADA POR APROVAÇÃO” (não “em produção”).

---

## 3. VARIÁVEIS DE AMBIENTE — MATRIZ DE CONTROLE

**Não colocar valores reais neste documento, no ZIP ou em prints.** Nome, responsabilidade e escopo de configuração:

| Nome | Local/uso | Regra de segurança/validação |
|---|---|---|
| `VITE_SUPABASE_URL` | Front/build | URL do Supabase staging ou prod correspondente; pública |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Front/build | Chave publicável, nunca service_role |
| `VITE_SUPABASE_PROJECT_ID` | Front/build, se necessário | Ref do projeto correto; conferir compatibilidade com o cliente |
| `SUPABASE_URL` | Backend | Mesmo projeto de `VITE_SUPABASE_URL`; HTTPS |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Chave publicável, ambiente correto |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend **somente** | Nunca VITE_, browser ou logs |
| `AUTH_CRYPTO_SECRET` | Backend | Segredo estável >=32 caracteres aleatórios; assinaturas internas e Auth |
| `INTEGRATION_VAULT_KEY` | Backend | Base64 canônico de 32 bytes criptográficos; estável; não misturar variantes |
| `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` | Backend/bootstrap | Allowlist só durante primeiro bootstrap; remover depois; usuário verificado |
| `PUBLIC_APP_URL` | Backend/produção | Origem HTTPS canônica; sem user/password/path/porta/query |
| `CONTEXT` | Netlify | `deploy-preview`, `branch-deploy` ou `production`; conferido por `trustedAppOrigin` |
| `DEPLOY_PRIME_URL` | Netlify preview | Origem gerada pela Netlify; obrigatória no preview para callbacks internos |
| `PRODUCTION_APP_URL` | GitHub/teste smoke | URL real usada somente para *bloquear* smoke contra prod |
| `TEST_BASE_URL` | Testes HTTP | Deploy Preview isolado ou localhost de teste; nunca domínio produtivo |
| `EVOLUTION_API_URL` | Backend | Endpoint HTTPS da Evolution correta para o ambiente |
| `EVOLUTION_API_KEY` | Backend/cofre fallback | Segredo de saída, nunca browser |
| `EVOLUTION_WEBHOOK_TOKEN` | Backend/cofre fallback | Autenticação de entrada; não usar em querystring |
| `ENABLE_EVOLUTION_RECOVERY` | Backend/Netlify | `false` até validar recovery real no staging; `true` em produção só após autorização |
| `RESEND_API_KEY` | Backend/cofre fallback | Conta e domínio de teste nos previews |
| `RESEND_FROM_EMAIL` | Backend | Remetente validado; sandbox/produção separados |
| `GROQ_API_KEY` | Backend/cofre fallback | Agentes com modelos/quotas de teste nos previews |
| `GROQ_MODEL` | Backend | Modelo configurado pelo agente; validar disponibilidade |
| `SYSTEM_CRON_SECRET` / `_PREVIOUS` | Backend, se utilizado | Rotação do cron protegido, não expor nem misturar com Auth |
| `ENABLE_BILLING` | Backend | **false** no core |
| `VITE_ENABLE_BILLING` | Front | **false** no core |
| `INTEGRATION_TEST_ALLOWED_HOSTS` | Testes isolados, se usado | Apenas hosts explicitamente autorizados; nunca liberar arbitrariamente |

**Gates já existentes:** `npm run audit:env` (somente condições de produção) e `npm run audit:release`. Executar sem redirecionar o conteúdo das variáveis para logs.

**Atenção a ambiente econômico:** não é necessário criar novos secrets reais para testar parsing, mocks, lint, typecheck e build. Solicitar secrets sandbox **somente** na etapa de integração correspondente.

---

## 4. REGRA DE VALIDAÇÃO, ERROS E REINCIDÊNCIA (CHECKLIST TÉCNICO)

| Situação | Resposta desejada / prova |
|---|---|
| API privada sem bearer/sessão | 401, sem side effect |
| Autenticado sem permissão global/local | 403, ou 404 para recursos não enumeráveis |
| Cross-tenant por UUID | 403/404/0 registros, sem vazamento |
| OTP/challenge inválido | 400/401/429 consistente, sem login/alteração |
| OTP consumido/expirado | falha definitiva; nenhuma alteração e nenhuma reutilização |
| Last owner/superadmin | rejeição transacional consistente, inclusive com duas sessões paralelas |
| Webhook sem token válido | 401, sem salvar/reenviar evento |
| Webhook com rate limiter indisponível | 503, fail-closed; não aceitar bypass |
| Webhook request flood | 429 com retry informado quando suportado |
| Worker assinatura ausente/adulterada/vencida | não processa (validar logs de erro sem dados) |
| Dois workers mesmo evento | no máximo um claim válido e nenhum efeito externo duplicado |
| `next_attempt_at` futuro | não consumir até vencimento |
| Worker interrompido `processing` | recuperar após lease 20min, nunca antes |
| Falha com tentativas esgotadas | `dead_letter`; nenhuma repetição infinita |
| HTTP redirect de serviço com chave | falha segura; segredo não é reenviado |
| Resend rede/5xx/429 transitório | retry limitado e mesma chave de idempotência |
| Resend 4xx definitivo | não repetir cegamente |
| Newsletter envio concorrente/ambíguo | lock `draft`→`queued`; sem segundo disparo; reconciliar com provedor |
| Newsletter sem opt-in | não enviar nem inscrever automaticamente |
| Upload mídia falsa/maior que 3 MiB | HTTP erro claro; nenhum arquivo persistido |
| Storage `newsletter-media` | leitura pública só onde intencional; gravação restrita |
| Build Netlify com env faltando | gate produção FAIL sem imprimir segredo |
| Billing core | nenhuma rota/checkout ativo com flags false |
| Preview Netlify chamando produção | REJEITAR; link interno/convite deve ficar no preview |
| Migrations divergentes | BLOCKED/diagnóstico, não corrigir histórico vivo às cegas |

---

## 5. ARTEFATOS FINAIS E EVIDÊNCIAS — FORMATO OBRIGATÓRIO

O Work entregará, após executar o que estiver disponível:

1. `inboxos-release-validado-YYYY-MM-DD.zip`: **código completo** (sem `node_modules`, `dist`, `.env` reais nem dados privados); lockfile atualizado quando houver registry. Só nomear “validado” se os gates pertinentes passarem; senão “release-candidate”.
2. `inboxos-work-changes.patch`: diff revisável contra Fase 8. Reportar quantidade de arquivos adicionados/modificados e finalidades (sem segredos).
3. `INBOXOS_QA_FINAL.md`: **uma** matriz por gate com `PASS`/`FAIL`/`BLOCKED`, comando/etapa, data/hora, prova (trecho curto de log sanitizado, screenshot sem dados reais ou descrição verificável), regressão e risco restante.
4. `INBOXOS_ACOES_PROPRIETARIO.md`: **somente** decisões/acessos externos realmente indispensáveis, agrupadas uma vez; indicar custo aproximado se houver serviço pago, alternativa grátis e quais tarefas não dependem da decisão.
5. Resumo final de no máximo 10 linhas: o que mudou, o que passou, bloqueios reais, custo/ações que requerem dono, se há ou não autorização para produção. Não recontar Fases anteriores.

**Modelo da matriz (preencher):**

| Gate | Estado | Evidência mínima | Próximo passo se falhar |
|---|---|---|---|
| Node/npm/lock | BLOCKED | comando, saída sanitizada e versões | corrigir lock com npm real |
| npm ci | BLOCKED | exit code | resolver registry/compatibilidade |
| 149+ testes locais | PASS anterior; refazer após mudanças | total PASS/FAIL atual | corrigir regressões |
| release static audit | FAIL anterior (lock) | 0 divergências novas | regenerar lock |
| ESLint | BLOCKED | exit code | corrigir erros concretos |
| tsc --noEmit | BLOCKED | exit code | corrigir tipos concretos |
| Vite/Netlify build | BLOCKED | output dist/client + função SSR | corrigir bundle |
| Migrations staging | BLOCKED | lista e logs/DDL sintético | reconciliar histórico |
| 2-tenant/RBAC E2E | BLOCKED | matriz HTTP e resultado em DB | corrigir guards |
| Evolution/cron sandbox | BLOCKED | statuses/eventos sintéticos | corrigir fila |
| Groq/Resend/newsletter | BLOCKED | IDs de eventos de teste, sem PII | corrigir integração |
| Netlify preview/visual | BLOCKED | URL preview + prints redigidos | corrigir UI/runtime |
| Produção | NÃO AUTORIZADA | aprovação explícita em separado | não publicar |

**Regra:** a coluna “PASS anterior” **não** deve virar “PASS de homologação” sem executar o teste correspondente no ambiente certo.

---

## 6. ORDEM ECONÔMICA: O QUE O WORK REALMENTE PRECISA FAZER PRIMEIRO

| Ordem | Esforço esperado | Trabalho | Próxima etapa permitida |
|---|---|---|---|
| **1 (obrigatória)** | Baixo/médio | Corrigir lock e passar CI, tsc, lint, build **uma única vez por correção** | Só depois depurar runtime |
| 2 | Médio | Staging local e migrations; identificar diferenças reais, proteger owners/superadmins | Sem banco vivo |
| 3 | Médio | Smoke HTTP anônimo + testes autenticados mínimos de 2 tenants e ADM | Só contas sintéticas |
| 4 | Médio | Evolution sintética + recovery/cron `Run now` + idempotência | Só sandbox |
| 5 | Baixo/médio | Resend/Groq e newsletter apenas em destinatários testes, UI essencial | Sem campanhas amplas |
| 6 | Baixo | Consolidar QA, pacote, patch e decisões para aprovação | Não publicar automaticamente |

**O QUE NÃO PAGAR PARA O WORK REFAZER:** reconstrução do InboxOS, branding, landing page, arquitetura, interfaces inteiras, documentação histórica, 149 testes analisados um por um, análise genérica de “tudo que pode causar bugs”, reimplementação de cron, HMAC, cofre, OTP, newsletter, `fetchCredentialed` ou rotas existentes sem erro concreto.

---

## APÊNDICE A — INVENTÁRIO TÉCNICO DE ROTAS DA VERSÃO FASE 8

**Gerado pela leitura de `src/routes/api` do código-base atual.** Métodos encontrados por inspeção estática dos handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). A forma do caminho vem de `createFileRoute`; a **execução real** continua dependente do TanStack/Vite. Parâmetros dinâmicos devem ser substituídos por IDs sintéticos válidos em staging. Métodos não identificados estaticamente precisam ser conferidos no arquivo correspondente.

 | GET | `src/routes/api/media/$.ts` |
| `/api/media/upload` | POST | `src/routes/api/media/upload.ts` |
| `/api/messages/send` | POST | `src/routes/api/messages/send.ts` |
| `/api/profile/avatar` | POST | `src/routes/api/profile/avatar.ts` |
| `/api/profile/` | GET, PATCH | `src/routes/api/profile/index.ts` |
| `/api/public/webhooks/evolution` | POST | `src/routes/api/public/webhooks/evolution.ts` |
| `/api/sync/evolution` | POST | `src/routes/api/sync/evolution.ts` |
| `/api/sync/import` | POST | `src/routes/api/sync/import.ts` |
| `/api/workspaces/activate` | POST | `src/routes/api/workspaces/activate.ts` |
| `/api/workspaces/` | GET, POST | `src/routes/api/workspaces/index.ts` |
| `/api/workspaces/invitations/accept` | POST | `src/routes/api/workspaces/invitations/accept.ts` |
| `/api/workspaces/invitations/create` | POST | `src/routes/api/workspaces/invitations/create.ts` |
| `/api/workspaces/invitations/` | GET | `src/routes/api/workspaces/invitations/index.ts` |
| `/api/workspaces/invitations/revoke` | POST | `src/routes/api/workspaces/invitations/revoke.ts` |
| `/api/workspaces/members/` | GET, POST | `src/routes/api/workspaces/members/index.ts` |


---

## APÊNDICE B — REFERÊNCIAS DIRETAS (CONSULTAR SOMENTE SE NECESSÁRIO)

- Netlify/TanStack Start: https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/
- Netlify Scheduled Functions, `Run now` e previews: https://docs.netlify.com/build/functions/scheduled-functions/
- Supabase migration list e história: https://supabase.com/docs/reference/cli/supabase-migration-list
- Supabase migrations / reconciliação: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage: https://supabase.com/docs/guides/storage

**Fim. Esta é a especificação única que deve acompanhar o ZIP da Fase 8.**
