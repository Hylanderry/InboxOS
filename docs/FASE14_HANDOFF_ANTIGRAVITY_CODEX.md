# INBOXOS — FASE 14: HANDOFF DEFINITIVO PARA ANTIGRAVITY + CODEX
**Documento operacional detalhado • 11/10/2026 • português brasileiro**

> **Ler primeiro:** a base é o ZIP **Fase 14** que contém os patches de UI/UX já implementados neste ciclo, mais todas as fases anteriores. **Não** voltar para a Fase 10/11/12/13 nem substituir o ZIP por um repositório divergente sem diff. Esta é a divisão de trabalho: UI/UX corrigida localmente nesta rodada; **Antigravity/Codex responde por build, backend, banco, integrações, staging e QA visual real**. O objetivo é corrigir, rodar, provar — não somente gerar planos.

## 0. Status incontestável e separação de responsabilidades

| Área | Evidência/estado atual | Próximo responsável |
|---|---|---|
| Código-base F13 com correções acumuladas da Evolution | preservado na F14, sem alteração do backend nesta rodada | Codex: preservar |
| UI/UX F14 — patches frontend | busca sincronizada, composer resiliente, inputs/ARIA, CSS responsivo e skills já no ZIP | Antigravity: QA visual, ajustes residuais somente quando comprovados |
| 210 testes Node | **PASS 210/210** em 11/10 (202 existentes + 8 novos estáticos) | Codex: repetir no ambiente de build |
| Auditoria de 269 arquivos TypeScript | parse e imports relativos PASS, 83 rotas PASS; NÃO é typecheck | Codex: TypeScript real |
| `package-lock.json` | **FAIL: seis inconsistências exatas** | Codex: prioridade P0 |
| `npm ci --offline` | **BLOCKED ENOTCACHED** para plugin Netlify | Codex: registry npm válido |
| `npm run lint` | **BLOCKED eslint: not found** | Codex: executar após npm ci |
| `tsc --noEmit` | **BLOCKED TS2688 vite/client missing** | Codex: executar após npm ci |
| `npm run build` | **BLOCKED vite: not found** | Codex: executar após npm ci |
| Staging com Supabase e Evolution reais | **NOT RUN** nesta rodada | Codex: após build |
| Produção/WhatsApp cliente | **NENHUMA ALTERAÇÃO** | NÃO executar sem aprovação explícita |

**Atenção sobre status:** FAIL = resultado comprovadamente incorreto; BLOCKED = infraestrutura/pré-requisito impeditivo, não julgamento do código; NOT RUN = ainda não executado. Não converta BLOCKED em PASS por inspecionar código.

## 1. Instalação de skills e regras — OBRIGATÓRIO NO SEU WORKSPACE

A F14 já contém a skill e a regra **no projeto**, nos caminhos oficialmente suportados pelo Antigravity:

```text
inboxos-evolution-final-audit/
  AGENTS.md
  .agents/rules/inboxos-uiux-consistency.md
  .agents/rules/evolution-staging.md
  .agents/rules/supabase-production-safety.md
  .agents/skills/inboxos-premium-uiux/SKILL.md
  .agents/skills/inboxos-backend-release/SKILL.md
  docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md
  docs/FASE14_UIUX_AUDITORIA.md
```

**No Antigravity:** abrir a pasta raiz que contém `package.json`. Reiniciar/recarregar a sessão do agente, solicitar que ele liste as skills disponíveis e leia **explicitamente** as duas skills F14. `AGENTS.md` e `.agents/rules/*.md` são regras persistentes. Os arquivos **não precisam ser reinstalados via `npx skills`** para este workspace. Se quiser a skill global em todos os projetos, copie conscientemente para `~/.gemini/config/skills/inboxos-premium-uiux/SKILL.md` (criar pasta) — preferir modo workspace para não contaminar outros projetos.

**Não copie** a skill para `.agents/workflows/`: o local atual é `.agents/skills/`. Referência: https://antigravity.google/docs/skills e https://antigravity.google/docs/rules/ (caminhos confirmados em 11/10/2026). **A presença no ZIP não confirma que o Antigravity do usuário a carregou**: testar listagem efetiva de skills no seu aplicativo.

**Para o Codex:** ele deve ler `AGENTS.md` e o handoff; se a integração Codex não carregar skills automaticamente, instruir a leitura dos dois `SKILL.md` explicitamente; não assumir que um padrão de diretórios de outro agente funciona da mesma forma.

## 2. Lista EXATA das seis inconsistências do package-lock.json — P0

O script `scripts/audit-release-readiness.mjs` / `scripts/lib/release-validation.mjs` acusou:

1. `@lovable.dev/mcp-js` ainda como dependência no pacote raiz do lock **sem** entrada correspondente em `package.json`.
2. `@sentry/cloudflare` ainda como dependência raiz do lock **sem** entrada correspondente em `package.json`.
3. `@netlify/vite-plugin-tanstack-start` consta em `devDependencies` de `package.json` (`1.3.19`) **e não está corretamente listado no pacote raiz do lock**.
4. A resolução/entrada de pacote instalado para `@netlify/vite-plugin-tanstack-start` **não existe no lock**.
5. `@lovable.dev/vite-tanstack-config` ainda listado como devDependency no lock **sem** entrada correspondente no manifest.
6. `nitro` ainda listado no lock como devDependency **sem** entrada correspondente no manifest.

**Causa provável (hipótese, não comprovação):** manifest mudou em refatorações sucessivas e lockfile não foi refeito depois da troca de adapter/configuração. Não remover dependências transitivas por nome sem inspecionar a árvore npm resultante. Pode existir dependência transitiva ainda válida mesmo se a entrada raiz for obsoleta.

**Reprodução real neste executor (evidência):**

```text
npm ci --offline --ignore-scripts --no-audit --no-fund
=> npm ERR! ENOTCACHED request to https://registry.npmjs.org/@netlify%2fvite-plugin-tanstack-start
npm run audit:release
=> FAIL package-lock integrity for direct dependencies: 6 issue(s)
npm run lint
=> sh: eslint: not found
npx (não executado nesta rodada; evitar download inesperado)
tsc --noEmit
=> error TS2688: Cannot find type definition file for 'vite/client'
npm run build
=> sh: vite: not found
```

**Como resolver em máquina com registry e DNS funcional:**

```bash
node -v                       # alvo: >=22.12.0, preferir 22.16.0
npm -v                        # manifesto sugere 10.9.2
npm config get registry       # esperado: https://registry.npmjs.org/
npm ping                      # diagnosticar acesso, não alterar TLS para passar
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
# revisar o diff de package-lock.json; package.json não deve mudar sem justificativa
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run build:gated
```

**Aceite:** todos retornam exit 0 no mesmo commit; lock é versionado e `npm ci` reprodutível em instalação limpa; logs sem tokens e registry legítimo; diffs de TanStack/Netlify/Vite revisados. **Não usar** `--force`, `--legacy-peer-deps`, `npm install` em loop, `NODE_TLS_REJECT_UNAUTHORIZED=0`, edição manual de `integrity`, desativação do audit ou `ts-ignore` em massa.

**Impacto potencial e regressão:** atualizar versões transitivas pode alterar SSR, roteamento, imports e engine Node. Comparar `vite.config.ts`, `netlify.toml`, scripts de build, `dist/client`, server handlers e generated routeTree. Se houver conflito de peerDependencies, registrar matriz de compatibilidade do conjunto React 19 / TanStack Start- Router / Vite 8 / adapter Netlify 1.3.19 e resolver a combinação menor e suportada, com testes.

## 3. Dependências restantes que não podemos construir/homologar aqui — G1

| ID | Falha observada | Passo Codex | Evidência mínima para PASS | Possível regressão |
|---|---|---|---|---|
| G1-01 | Lockfile com 6 divergências | regenerar via npm oficial; revisar diff | audit release verde | atualizar transitivas incompatíveis |
| G1-02 | npm offline ENOTCACHED | validar TLS/DNS/registry; `npm ci` em CI limpo | log npm ci 0 sem flags de força | instalação diferente no CI |
| G1-03 | `eslint: not found` | npm ci, depois `npm run lint` e corrigir avisos/errors reais | lint 0 | mudar hooks/comportamento involuntariamente |
| G1-04 | `vite/client` ausente | npm ci, depois `npx --no-install tsc --noEmit` | typecheck 0 | tipos forçados/unsafe any |
| G1-05 | `vite: not found` | npm ci, depois `npm run build` | bundle cliente+server comprovado | mismatch SSR/client, rotas |
| G1-06 | Netlify adapter não validado | `npm run build:gated` com env teste | gate 0, log saneado | functions/route handler incompatíveis |
| G1-07 | Server local não verificado | `npm run dev`, `npm run preview`, smoke HTTP | autenticação e páginas sem 404/hydration | reescritas de rota/API |
| G1-08 | supply chain não inspecionada | npm audit + diff com classificação | riscos triados e mitigados | `npm audit fix` atualiza APIs sem controle |
| G1-09 | QA frontend browser bloqueado | depois de build, navegadores nos 6 breakpoints e iOS keyboard | evidências da matriz UI F14 | ajustes de padding quebram chat em altura curta |

### Se a instalação falhar novamente
- `EAI_AGAIN/ENOTFOUND`: problema DNS/proxy. Verificar resolução, `npm config get registry`, `npm ping`, rede corporativa e certificado; parar após diagnóstico em vez de tentar opções inseguras.
- `ENOTCACHED`: pacote exigido não está no cache offline; não continuar fingindo que o lock está correto.
- `ERESOLVE`: peerDependency incompatível; extrair árvore `npm explain`, version matrix, ajustar a menor superfície e revalidar.
- `ENOENT` em `vite/eslint`: node_modules inexistentes; retornar ao npm ci, não instalar pacote global como falsa correção.
- Falha no SSR: gravar stack com rota e boundary afetados, criar regressão e não modificar todas as rotas em lote.

## 4. Supabase — banco staging, migrações e segurança — G2 P0

**Não podemos comprovar schema vivo a partir de arquivos SQL locais.** Mesmo os commits que criaram tabelas podem divergir do histórico real. O plano de migração detalhado já existe em `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md` e `scripts/sql/inspect-message-identity-readonly.sql`.

### Passos em ordem
- [ ] Identificar o **projeto staging** separado e o projeto real (refs distintas, sem imprimir secrets); inspecionar env efetiva do Deploy Preview; backup restaurável.
- [ ] Conferir `supabase --help` e versão antes de usar comandos CLI; conferir changelog atual do Supabase e o histórico `supabase_migrations.schema_migrations` somente leitura.
- [ ] Comparar migrations de setembro/outubro com schema real: colunas, constraints, triggers, índices, RLS, grants, funções e overloads de RPC.
- [ ] Validar sem alterar produção a proteção do último owner e do último superadmin, transferência atômica, suspensões, revogação de sessão e auditoria, incluindo corridas simultâneas.
- [ ] Testar pelo menos dois tenants e duas instâncias. Para cada endpoint privado: usuário A não lê, edita, exporta nem envia para B por UUID adulterado (IDOR/BOLA); status 403/404 ou vazio quando adequado.
- [ ] Investigar índice/constraint antiga `messages_workspace_external_key UNIQUE (workspace_id,external_id)` e RPC `persist_inbox_message` sem escopo de instância. Alterar **somente com migration + RPC + wrappers + consumidores coordenados**, testes de concorrência e rollback. **Não dropar a UNIQUE antiga isoladamente.**
- [ ] Rever colisões entre `client_message_id`, outbox, receipts e media. O backfill de `instance_id` é proibido se a relação é ambígua; exige plano de reconciliação.
- [ ] Validar RLS em todas as tabelas expostas, privilégio EXECUTE de functions `SECURITY DEFINER`, políticas de Storage, `search_path`, papéis Auth e Security/Performance Advisors.
- [ ] Testar restore, roll-forward e replay sintético em staging. Só então propor PR de migration para aprovação; sem tocar produção.

### Riscos específicos que devem ser escritos no PR
1. **Dedup entre instâncias:** IDs iguais A/B colidem na UNIQUE atual, causando perda/atualização cruzada.
2. **Migração não atômica:** código antigo e nova UNIQUE podem divergir, com registros duplicados, mensagens perdidas ou `unread` inflado.
3. **RLS privilegiada:** `SECURITY DEFINER` sem escopo permite dados entre tenants; não resolver com `USING (true)`.
4. **Sessão revogada:** JWT ainda válido pode passar se o middleware não conferir revogação efetiva.
5. **Backfill irreversível:** em presença de colididos, rollback da antiga UNIQUE pode falhar após dados válidos entrarem. Planejar roll-forward/restore verificável.

**PASS G2** somente após SQL de staging aplicado, testes de concorrência e segurança aprovados, plano de recuperação e nenhum comando mutante no vivo. Relatar refs redigidas e hashes; nunca credenciais.

## 5. Evolution / mensagens / filas / workers / APIs — G3 P0

**Pontos conhecidos do histórico:** patches de contatos, grupos, fotos, presença, mensagens editadas/excluídas, isolamento por instância, proteção de duplicatas, retries/dead-letter, background functions, fila de webhooks. Eles passaram em testes locais, não em operação real ponta a ponta.

### Arquivos/caminhos a ler antes de editar
- `src/routes/api/public/webhooks/evolution.ts`
- `src/routes/api/messages/send.ts`
- `src/lib/evolution.server.ts`
- `src/server/evolution/` (normalizadores, claims, outbox, retry e worker)
- `netlify/functions/evolution-events.mts`, `netlify/functions/evolution-recover.mts`
- `scripts/evolution-preview-smoke.mjs`, `scripts/validate-staging-target.mjs`
- `tests/evolution-*`, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`.

### Checklist de execução
- [ ] Revalidar contratos HTTP mapeados (status 200/201, 400/401/403/404/409/429/5xx); não assumir que 83 rotas TS = 83 contratos HTTP.
- [ ] Webhook inválido/repetido: não gravar nem processar duas vezes; HTTP 2xx não significa worker concluído.
- [ ] `CONTACTS_UPDATE`, `UPSERT`, `@lid`, grupos e avatares: preservar nomes e fotos quando payload parcial, escopo workspace+instance, índices `ON CONFLICT` reais.
- [ ] `PRESENCE`, `MESSAGES_UPSERT`, edit, delete, reaction, quoted, receipts: estado não deve retroceder, idempotência por instância, mensagens A/B isoladas.
- [ ] Duplicata concorrente do mesmo `clientMessageId`: uma aceitação remota; timeout ambíguo: não reenviar cegamente.
- [ ] Netlify background claims, lease expiry, poison events, dead_letter, retry, dedup e reprocessamento seletivo **somente sandbox**; registrar transições de estado.
- [ ] APIs da autenticação e painel ADM: 2FA/OTP, rate limits, login e senha, convites/roles, superadmin e auditor, newsletter opt-in, uploads; entradas maliciosas/limites.
- [ ] Critério PASS não é apenas testes unitários: eventos na Evolution sandbox + efeitos exatos nas tabelas + UI + logs + duas contas de teste autorizadas.

### E01–E22: critérios de execução obrigatórios
Usar a matriz **completa** já registrada em `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`. Cobertura:
- E01–E03: autenticação de webhook, tamanho/JSON, dedup.
- E04–E08: contatos/JIDs/chats/presença/mídia e grupo.
- E09–E13: receipts, edição, exclusão, reação, quote, isolamento tenant/instance.
- E14–E18: idempotência remota, timeout, outbox, recuperação, dead letter.
- E19–E22: IA anti-replay, mensagens reais apenas entre contas de teste, webhook de preview, health/cron.
**Não fazer** E20 até o operador confirmar números/instâncias de teste e autorização. E01–E22 não podem ser marcados como PASS porque o script sintético retornou 2xx.

## 6. Integrações Resend/Groq e Administração — G4

- [ ] Testar e-mails transacionais de OTP login/registro/recuperação/troca de e-mail com caixas de teste; expirado/usado/incorreto não confirma ação.
- [ ] Testar Resend agendamentos, opt-in/unsubscribe, templates e mídias com limites e autorização; não enviar broadcast a base real.
- [ ] Validar chave cofre criptografado/rotação, permissões de leitura superadmin/auditor/operator/support; não expor valor em JSON/log/browser.
- [ ] Groq: desabilitar auto-reply durante smoke da Evolution; testar in/out com contas próprias, rate limit, anti-replay e escape de conteúdo adversarial.
- [ ] Validar erros/timeouts/retries sem travar UI; observar que handoff UI F14 adicionou finally ao envio de texto.
- [ ] Billing CORE continua **OFF**. Não reativar fork ou redesenhar preço/assinatura.

## 7. Netlify Deploy Preview + QA de UI e segurança — G5

- [ ] Fazer build e preview apenas após G1 verde. Deploy Preview deve referenciar staging DB e instância Evolution sandbox; conferir variáveis efetivamente resolvidas (sem imprimir segredos).
- [ ] Rodar `npm run test:integration` apontando apenas para `TEST_BASE_URL` permitido; `PRODUCTION_APP_URL` configurado para bloquear a origem real.
- [ ] Rodar `scripts/evolution-preview-smoke.mjs` primeiro no modo dry-run. O `--execute` exige `EVOLUTION_STAGING_SUPABASE_REF`, `EVOLUTION_PRODUCTION_SUPABASE_REF`, `STAGING_ISOLATED_DB_CONFIRMED=yes`, `STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes`, token e URL exata.
- [ ] E01-E22 com relatório de efeitos no banco; isolar Webhook da produção.
- [ ] Executar auditoria UI **na aplicação realmente aberta**: screenshots 320, 360, 390, 768, 1024, 1440 + landscape/iPhone + light/dark + zoom200 + reduced motion.
- [ ] Examinar `docs/FASE14_UIUX_AUDITORIA.md`: existe risco de densidade do header de chat em 320px e possível duplicidade de Toast após falha de envio. Validar e corrigir com teste visual.
- [ ] Verificar accessibilidade por teclado/rotulagem/contraste, modais/scroll, auth OTP, loading/error/empty, search compartilhada e safe areas.
- [ ] Monitorar Sentry/Netlify logs ou observabilidade equivalente para 4xx/5xx, falha Background, dup sends, consultas cross-workspace.

## 8. Critérios finais de release, rollback e permissão — G6

**NO-GO enquanto um só P0 estiver BLOCKED/FAIL/NOT RUN.** Aprovação exige:

- [ ] CI/G1 verde num commit único, sem warnings de build relevantes ou lock divergente.
- [ ] Migrations/RLS/concurrency G2 staging e restore ensaiados.
- [ ] G3/G4 APIs, Evolution E01–E22, Auth/Resend/Groq e outbox com evidência.
- [ ] QA G5 com screenshots/análise de regressão light/dark/mobile.
- [ ] Métricas/alertas, backups, planos roll-forward/rollback e feature flags prontos.
- [ ] Aprovação explícita do proprietário **antes** de deploy no projeto de produção, alteração de banco, backlog, webhook real ou envs de produção.

## 9. PROMPT POSITIVO — copiar ao Antigravity/Codex (instruções desejadas)

> Trabalhe exclusivamente sobre a versão **InboxOS Fase 14** entregue, preservando suas correções de UI/UX, os hotfixes Evolution das Fases 10–13 e as decisões de produto. Abra o `AGENTS.md`, leia as skills `inboxos-premium-uiux` e `inboxos-backend-release` em `.agents/skills/`, e leia `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`, `docs/FASE14_UIUX_AUDITORIA.md` e `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`. Liste o estado real e crie branch. Execute **G1 primeiro**: npm oficial, lockfile, npm ci, tests, audit, lint, typecheck, build e Netlify gated. Para cada falha, identifique causa comprovável, menor correção segura, teste de regressão, risco e evidência; preserve o padrão de design do projeto. Depois execute G2–G5 **somente staging isolado**, validando schema Supabase real, permissões multi-tenant, idempotência de mensagens entre instâncias, evolução E01–E22 e APIs. Faça QA visual no browser usando a skill UI/UX. Atualize checklist com PASS/FAIL/BLOCKED/NOT RUN. Gere PR/patch e resumo de alterações, mas mantenha release NO-GO até tudo comprovado e **não modifique produção** sem minha autorização explícita.

## 10. PROMPT NEGATIVO — copiar como proibições explícitas

> NÃO reescreva o app do zero, NÃO faça redesign genérico, NÃO descarte patches das fases anteriores, NÃO troque Phosphor por outro kit, NÃO remova glassmorphism, NÃO use neon excessivo, NÃO quebre layout mobile, NÃO modifique UI se tarefa é backend, NÃO instale libs desnecessárias, NÃO remova testes, NÃO marque build como aprovado por parse estático, NÃO use `--force`/`--legacy-peer-deps`/checksums fabricados, NÃO esconda TypeScript com `any` generalizado, NÃO desligue ESLint/CI, NÃO ignore erros do Supabase, NÃO reduza controles RLS, NÃO execute `db reset`/`db push`/`migration repair`/migração/backfill na produção, NÃO envie mensagens WhatsApp a clientes, NÃO ligue agente de resposta automática em smoke, NÃO altere webhooks de produção, NÃO crie email broadcast real, NÃO exponha service_role/chaves/logs, NÃO reative Billing, NÃO publique produção ou assuma aprovação sem minha autorização. Se faltar acesso, declare BLOCKED e entregue o que conseguir comprovar offline.

## 11. Entregáveis obrigatórios do Antigravity/Codex

1. `docs/RELATORIO_G1_BUILD.md`: saída de cada comando, versões, diff lockfile, dependências e build artifacts (sem segredo).
2. `docs/RELATORIO_G2_STAGING_DB.md`: constraints/RPC/RLS reais, queries read-only, migrations aplicadas só em staging, testes concorrentes e restore.
3. `docs/RELATORIO_G3_G4_EVOLUTION_E2E.md`: E01–E22 com PASS/FAIL/BLOCKED, eventos e evidências redigidas.
4. `docs/RELATORIO_G5_UIUX_BROWSER.md`: matriz de telas/breakpoints, prints before/after, a11y e console/hydration.
5. `docs/RELATORIO_G6_GO_NO_GO.md`: blockers, logs, roll-forward/rollback, validação de segurança, aprovação pendente.
6. Código corrigido + `package-lock.json` legítimo + PR/patch revisável, sem sobrescrever original.
7. Registro por task: `ID | causa | arquivos | alteração | risco | teste | resultado | prova | rollback`.

## 12. Checkpoint de execução que você deve atualizar

| Gate | Status em 11/10/2026 | Critério de saída |
|---|---|---|
| G0 Base | PASS parcial (base F14) | hash/branch/env confirmados no Antigravity |
| G1 npm/build | FAIL/BLOCKED | npm ci + lint + tsc + build/gated PASS |
| G2 Supabase | BLOCKED | staging + migration + RLS + multi-instância PASS |
| G3 APIs/filas | BLOCKED | HTTP autenticado/outbox/worker PASS |
| G4 Evolution/IA/Email | NOT RUN | E01–E22 e fluxos permitidos PASS |
| G5 Preview/QA | BLOCKED | screenshots + console + smoke + a11y PASS |
| G6 Lançamento | NO-GO | P0 completos + aprovação humana |

### Referências preservadas do projeto
`ANTIGRAVITY_NPM_E_CONTEXTO_COMPLETO.md`, `docs/FASE13_PLANO_E_CHECKLIST.md`, `docs/FASE12_PLANO_E_CHECKLIST_ATUALIZADO.md`, `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md`, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`, `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`, `docs/FASE14_UIUX_AUDITORIA.md`.

**Não assumir** que relatórios históricos equivalem a execução atual; a fonte de verdade de cada gate é a evidência da revisão atual em staging/CI.
