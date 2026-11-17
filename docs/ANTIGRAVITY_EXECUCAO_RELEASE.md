# InboxOS — roteiro operacional para a homologação no Antigravity

**Origem:** última base `inboxos-evolution-correcoes-2026-10-02.zip`. **Status em 02/10/2026:** código com 185/185 testes unitários locais, análise sintática de 266 arquivos TS e 83 rotas, mas lockfile divergente, build/lint/typecheck E2E **não demonstrados**. Não afirmar READY sem gates completos.

## Princípio de economia
Uma tarefa por vez, sem reescrever interfaces. Não reler 10 fases de histórico. Em cada gate, registrar em `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md`: o que mudou, comando, saída objetiva, falha pendente e evidência. Se houver bloqueio externo, mover para próximo gate independente e relatar bloqueio em uma linha. Toda mudança deve preservar o teste anterior.

## G0 — Preflight: identificar repositório e limites do ambiente
- Na raiz deve existir `package.json` com `name: inboxos`, `vite.config.ts`, `netlify.toml`, `supabase/migrations` e `src/routes/api/public/webhooks/evolution.ts`.
- Registrar estado de git (`git status --short`), Node, npm e branch. Se ZIP foi importado sem `.git`, criar repositório Git local antes de alterações; **não** sobrescrever outro projeto ou fazer push automático.
- Verificar se há staging **realmente separado**: ref Supabase não pode ser `aczstooavclxhmgtsobg`; Evolution test e número WA exclusivo; Netlify Deploy Preview com env de staging. Sem isso não pode passar gates que modificam dados.
- Comparar arquivo `.env.netlify.example` com variáveis configuradas; **nunca** copiar segredos para commits nem dar dump dos valores. `INTEGRATION_VAULT_KEY` é base64 de 32 bytes, não confundir com aliases de variantes antigas.
- Billing invariavelmente OFF. Desativar reconfiguração de webhook do preview por padrão (`EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false`). Agendamento `ENABLE_EVOLUTION_RECOVERY=false` até ser validado.

## G1 — Build e reprodutibilidade (primeiro bloqueio)
1. Usar Node >=22.12 (config do projeto em `netlify.toml` usa Node 22.16 e npm 10.9.2). Garantir acesso autorizado ao registry. Não adivinhar hashes de integridade.
2. Rodar em branch isolada:
```bash
node --version && npm --version
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
git diff -- package.json package-lock.json
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run build:gated
```
3. Há **seis divergências** no lockfile da última base; `@netlify/vite-plugin-tanstack-start@1.3.19` é dependência direta ausente no lock anterior. `npm ci` falhava `ENOTCACHED/EAI_AGAIN` na máquina anterior. Investigar e registrar **erros de build reais** (TanStack Start / Netlify / Typescript), sem remover dependências para suprimir problema.
4. Corrigir erros de lint de código legado sem reduzir regras; priorizar erros e warnings configurados como falha. Caso `npm run audit:release` continue reprovando, ler `scripts/audit-release-readiness.mjs` para encontrar diferenças adicionais de deps/rotas/flags.
5. Confirmar que `dist/client` foi gerado no build e que o adaptador Netlify empacotou o servidor conforme configuração. `netlify.toml` usa `npm run build:gated` para promoção e políticas de cabeçalhos.

**PASS G1:** `npm ci`, `npm test`, `audit:release`, lint, TypeScript, Vite e `build:gated` saem 0 na mesma revisão. Guardar hash do commit e ambiente.

## G2 — Staging Supabase / segurança / migrations
- Nunca usar o projeto de produção como staging. Criar/selecionar projeto **não produtivo**, usando chaves e tenants sintéticos.
- Auditoria read-only do banco real somente quando necessária: `docs/EVOLUTION_DB_DIAGNOSTIC_READ_ONLY_2026-10-02.sql`. Confirmar `whatsapp_contacts` UNIQUE (`workspace_id,instance_id,remote_jid`) e `whatsapp_presence` UNIQUE (`workspace_id,instance_id,phone`). Verificar **todos** os `onConflict` do código contra índices/constraints reais.
- Conferir `supabase/migrations/20261001230000_protect_last_privileged_members.sql`: migration local não constava no histórico da produção na última leitura. Testar em staging, inclusive duas transações concorrentes para remoção do último owner/superadmin e transferência atômica de owner.
- Confrontar inventário local de migrations com histórico de staging, evitando repetição/downgrade e nomes homônimos. `20261001134743_atomic_workspace_owner_transfer.sql` correspondia a função existente na produção da última leitura.
- Testar RLS e operações autenticadas com pelo menos dois workspaces e duas instâncias de WhatsApp independentes; `service_role` não pode vazar para cliente; token expirado/revogado e suspensão devem falhar adequadamente.
- Verificar rollback/restauração em staging (sem executar restore em produção).

**PASS G2:** migrations coerentes e versionadas, transações concorrentes sem violar papéis, dados A inacessíveis a B, webhook/contatos sem SQL 42P10.

## G3 — APIs e fluxo interno de dados
- Validar autenticação de usuários/administradores, convites, OTP, alteração de e-mail/telefone e recuperação de senha com dados fictícios. Verificar tentativas concorrentes e consumo único de grant; não usar contas reais.
- Evolução `POST /api/public/webhooks/evolution`: casos de token ausente/inválido (401), corpo inválido (400), tamanho excessivo (413), rate limit (429 ou 503 conforme erro) e idempotência (202). Verificar persistência e status de evento após worker.
- Testar `POST /api/messages/send` e outbox: dois requests simultâneos com mesmo `clientMessageId`, timeout Evolution, erro 5xx, sucesso remoto + erro persistência local, status `unknown` e reconciliação sem duplicar WhatsApp.
- Testar `CONTACTS_UPDATE`, `CHATS_UPSERT`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_EDITED`, `MESSAGES_DELETE`, `PRESENCE_UPDATE`, reações, grupos, JID `@lid` e id de instância.
- Testar recuperação `netlify/functions/evolution-recover.mts`: `queued` antigo, `failed` com retry vencido, `processing` preso, limites de lote, assinatura do background, jobs concorrentes. **O agendamento não roda automaticamente em Deploy Preview.**
- Roteiro detalhado: `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`.

**PASS G3:** respostas HTTP corretas, mudanças realmente persistidas em staging, logs redigidos e zero vazamentos entre tenants/instâncias.

## G4 — Provedores reais em sandbox
- Evolution API **versão instalada real**: consultar docs/versão e confirmar `GET /webhook/find/{instance}` e os eventos configurados na instância de teste, sem editar webhook da instância produtiva.
- Contas de teste próprias/autorizadas: ida/volta de texto, mídia, recibos `DELIVERED→READ`, edição, remoção, reação, contatos, grupos. Confirmação na Evolution, UI e banco **de staging**; sem reenvio cego.
- Groq: chamada real com chave de teste, timeout, indisponibilidade, cancelamento, política de mensagens antigas; nunca acionar agente em eventos antigos reprocessados.
- Resend: sandbox/domínio autorizado, envio para caixa de teste, OTP e erros/retry; não enviar newsletter real a mailing produtivo.

**PASS G4:** ciclo completo rastreável sem 500/42P10 ou duplicidade, validação de falhas de rede, cotas e observabilidade.

## G5 — Netlify Deploy Preview, UI, observabilidade
- Habilitar preview no repositório e configurar environment vars da Netlify para contexto `deploy-preview` com **Supabase e Evolution de staging**; negar por padrão `EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE`.
- Rodar o script `node scripts/evolution-preview-smoke.mjs` **sem** `--execute` primeiro. Só executar com `--execute` se todos os envs `EVOLUTION_STAGING_*` apontarem staging e `STAGING_ISOLATED_DB_CONFIRMED=yes`; `HTTP 2xx` não é a prova final de consumo.
- Em desktop e celular, verificar login/logout, convites, permissões, lista de chats, nomes e telefones fallback, grupos, upload/download seguro, polling/realtime, envio, erros e reconexão.
- Confirmar cabeçalhos, timeouts, falhas esperadas e saúde `/api/health`; browser console sem erros graves. Armazenar screenshots **sem dados pessoais**.
- Testar rollback de deploy em staging. Confirmar monitoring para taxa de eventos `queued`, `failed`, `dead_letter`, e logs de Netlify functions.

**PASS G5:** URL de preview isolada, testes visuais e fluxos concluídos sem falhas de console/backend ou vazamentos.

## G6 — Planejar lançamento, pedir autorização (NÃO implantar sozinho)
- Checklist G1–G5 PASS na **mesma revisão** e evidências persistidas. Conservar último deploy estável e backup/PITR validado.
- A entrega ao usuário deve conter: (a) diff e lockfile final; (b) status dos gates; (c) versão/URL preview; (d) riscos restantes; (e) plano de rollback; (f) solicitação de autorização **específica** para deploy de produção.
- Depois da aprovação de publicação, validar monitoramento. O backfill dos `dead_letter` é **operação separada**; pedir aprovação específica para canário por lote/taxa. Jamais reprocessar ~8k mortos ou dezenas de milhares `queued` de uma vez.

## Critério GO / NO-GO
**GO:** todos G1–G5 PASS, dados isolados, evidências, rollback, autorização explícita. **NO-GO:** qualquer FAIL/BLOCKED crítico, falta de staging, SQL 42P10 persistente, backlog novo crescendo sem consumo, env de preview apontando produção, envio duplicado ou migrations não validadas.
