# InboxOS — Fase 13 · Plano de implementação e checklist (11/10/2026)

**Base real modificada:** `inboxos-fase12-correcoes-scoping-2026-10-11.zip` (SHA256 `dab3b3efe6c3b05acfb527168a742a6d30b3f35c19079cbce07f0779bdf57bb2`).
**Estado:** pré-produção / NO-GO. **Testes locais:** 202/202 PASS (195 anteriores + 7 novos).
**Status rastreável:** 8/66 PASS; 58 abertos. **Produção:** nenhuma alteração executada.

## Mudanças concluídas nesta rodada

1. **Proteção do teste sintético Evolution:** `scripts/evolution-preview-smoke.mjs` deixa de confiar apenas em uma referência fixa do Supabase e exige `EVOLUTION_PRODUCTION_SUPABASE_REF` e `PRODUCTION_APP_URL` reais. Continua protegendo a ref histórica da produção. Corrige o risco de uma troca de projeto tornar inoperante a comparação anterior.
2. **Bloqueio de respostas automáticas:** agora exige `STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes`, porque eventos inbound sintéticos podem acionar agentes apesar de um timestamp antigo. **Importante:** isso é uma declaração do operador, não desligamento automático; verificar configuração no preview.
3. **Guarda fail-closed:** URL https de Deploy Preview no host e caminho exatos, refs Supabase com formato esperado, produção e staging diferentes, token de webhook com tamanho mínimo e nome de instância validado. Os valores sensíveis não são exibidos.
4. **7 testes de regressão:** preview válido, separação de refs, flags obrigatórias, URL maliciosa, URL de produção/token curto, modo dry-run e `--execute` sem credenciais. Resultado: **202/202 testes locais PASS**.
5. **Acompanhamento:** painel Excel atualizado com fórmulas de contagem e tarefa G3-13 PASS (segurança do script local, NÃO homologação remota).

## Causa → correção → possível regressão → como verificar

| Causa | Correção | Risco residual e mitigação | Evidência |
|---|---|---|---|
| Prod ref codificada estaticamente | Exigir ref explícita em ENV e comparar refs | Operador pode declarar ref errada: conferir projetos efetivos no Netlify e Supabase | 2 testes PASS |
| Webhook sintético inbound pode disparar agente | Exigir confirmação de auto-reply desligado | Confirmação não desliga o sistema: inspecionar staging antes de --execute | 1 teste PASS |
| Possibilidade de alvo inesperado | URL exata de preview, esquema HTTPS e tokens validados | Novas ENV obrigatórias podem bloquear rotinas antigas: falhar fechado é intencional | 2 testes PASS |
| Dry-run precisa permanecer sem tráfego | Manter execução remota condicionada a `--execute` e preflight | Chamadas reais ainda exigem autorização/teste com instância isolada | 2 testes PASS |

## Evidências desta revisão

- `npm test` → **202 pass, 0 fail** (log `INBOXOS_FASE13_TEST_FINAL.log`).
- `node scripts/audit-release-readiness.mjs` → **FAIL no lockfile**, exatamente seis divergências; **PASS** parse de 269 fontes TS/TSX/MTS, imports locais e 83 rotas; Billing protegido.
- `npm ping` → `EAI_AGAIN`, sem registry no executor. **Não** houve `npm install`, `npm ci`, `npm run lint`, typecheck global, `npm run build` ou `build:gated` bem-sucedidos.
- **Sem** upload de credencial, envio real Evolution, Groq/Resend real, deploy Netlify, migrations nem alteração de banco/backlog.

## Prioridade da próxima rodada

1. **G1-01**: em ambiente com acesso a `registry.npmjs.org`, gerar `package-lock.json` exclusivamente com npm oficial, revisar diff (dependências removidas/adicionadas), executar `npm ci` limpo.
2. **G1-03 a G1-08**: executar teste, audit, lint, typecheck, build e build:gated no mesmo hash/commit. Não desligar gates para obter verde artificial.
3. **G0-05 a G0-07**: criar banco Supabase staging distinto, Evolution sandbox, contas autorizadas e secrets somente em ambiente de teste. Conferir que Deploy Preview **efetivamente** conecta ao banco isolado; não basta preencher ENV.
4. **G2-03/G2-04**: consultar schema **somente leitura** em staging para avaliar colisões de `external_id`; só depois coordenar UNIQUE, RPC e queries em migration versionada testada.
5. **G3/G4/G5**: executar E01–E22 de Evolution, OTP/Auth, fila, outbox, Groq/Resend, UI, preview e rollback com logs redigidos. Não utilizar dados reais.
6. **G6**: somente com evidências completas solicitar autorização separada para deploy em produção; qualquer reprocessamento histórico exige outra autorização.

## Checklist completo com status e critérios

### G0 — 4/7 PASS

- [x] **G0-01 — Verificar integridade da base da Fase 11** | `PASS` | P0
  - Corrige: Evitar continuar sobre pacote corrompido ou antigo. Risco: Mistura de versões, perda de correções.
  - Critério PASS: ZIP abre sem erro e estrutura InboxOS identificada. Pré-requisito: —.
  - Evidência: ZipFile.testzip(): OK; 439 entradas no pacote da Fase 11
- [x] **G0-02 — Registrar snapshot imutável, hash e branch de trabalho** | `PASS` | P0
  - Corrige: Permitir comparação e rollback do código. Risco: Sobrescrever trabalho atual ou aplicar patch duas vezes.
  - Critério PASS: Git branch/snapshot e SHA256 do ZIP registrado. Pré-requisito: G0-01.
  - Evidência: Snapshot ZIP imutável + diretório isolado; SHA256 aa64996f9c7ff2957e…; sem .git, não foi criada branch. docs/FASE12_SNAPSHOT_BASE_SHA256.md
- [x] **G0-03 — Conferir runtime Node e npm da revisão** | `PASS` | P0
  - Corrige: Fixar ambiente de build reprodutível. Risco: Versões diferentes geram dependências incompatíveis.
  - Critério PASS: Node >=22.12.0 e npm 10.9.2 identificados. Pré-requisito: —.
  - Evidência: Node v22.16.0 / npm v10.9.2
- [x] **G0-04 — Confirmar Billing desligado no código** | `PASS` | P0
  - Corrige: Não ativar fluxo de cobrança fora de escopo. Risco: Assinaturas ou rotas financeiras expostas sem homologação.
  - Critério PASS: audit:release confirma proteção de Billing OFF. Pré-requisito: —.
  - Evidência: PASS em auditoria 11/10/2026; flags de deploy ainda pendentes
- [ ] **G0-05 — Preparar Supabase staging com project ref distinto** | `BLOCKED` | P0
  - Corrige: Evitar escrever no banco de produção durante E2E. Risco: Dano em dados reais e migração irreversível.
  - Critério PASS: Ref de staging e credenciais segregadas comprovadas. Pré-requisito: G0-02.
  - Evidência: Staging não fornecido
- [ ] **G0-06 — Preparar Evolution v2 + contas de teste autorizadas** | `BLOCKED` | P0
  - Corrige: Garantir troca de mensagens sem atingir clientes. Risco: Mensagens e webhooks atingirem produção.
  - Critério PASS: Instância e números exclusivos para testes, separados do produção. Pré-requisito: G0-05.
  - Evidência: Ambiente de teste não fornecido
- [ ] **G0-07 — Configurar segredos e contexto de preview sem valores em logs** | `BLOCKED` | P0
  - Corrige: Separar serviço, vault e client env. Risco: Vazamento de service_role, API keys, tokens ou redirecionamento.
  - Critério PASS: ENV presentes no secret store, sem valores expostos; preview aponta somente para staging. Pré-requisito: G0-05.
  - Evidência: ENV reais indisponíveis

### G1 — 1/9 PASS

- [ ] **G1-01 — Corrigir seis divergências de package-lock com npm oficial** | `FAIL` | P0
  - Corrige: Restabelecer resolução determinística de dependências. Risco: Atualizações transitivas inesperadas ou quebra do adaptador Netlify.
  - Critério PASS: npm install --package-lock-only; diff revisado; audit:release sem divergências. Pré-requisito: G0-02.
  - Evidência: npm view @netlify/vite-plugin-tanstack-start@1.3.19 → EAI_AGAIN; lockfile não alterado; continuam 6 divergências.
- [ ] **G1-02 — Executar npm ci em instalação limpa** | `BLOCKED` | P0
  - Corrige: Comprovar que dependências se instalam a partir do lock. Risco: Optional deps incompatíveis ou download parcial.
  - Critério PASS: npm ci --include=dev --include=optional sai 0. Pré-requisito: G1-01.
  - Evidência: Registry npm inacessível (EAI_AGAIN); npm ci sem PASS neste ambiente.
- [x] **G1-03 — Reexecutar testes unitários e regressão** | `PASS` | P0
  - Corrige: Garantir que hotfixes existentes não regrediram. Risco: Novo pacote poderia alterar fixtures ou carregadores.
  - Critério PASS: npm test na versão final Fase 12 retorna 195/195; repetir após corrigir lockfile. Pré-requisito: G0-01.
  - Evidência: Fase 12, npm test: 195/195 PASS (189+6); log INBOXOS_FASE12_TEST_2026-10-11.log. Repetir após reparo do lock.
- [ ] **G1-04 — Auditoria release: parsing, imports, rotas, Billing e lockfile** | `FAIL` | P0
  - Corrige: Confirmar integridade estrutural antes da compilação. Risco: Ignorar falhas restantes por falso positivo.
  - Critério PASS: npm run audit:release retorna 0 em TODAS as checagens. Pré-requisito: G1-01.
  - Evidência: Fase12: audit:release FAIL 6 divergências no lock; PASS parser 269 TS, 83 rotas, imports e Billing OFF.
- [ ] **G1-05 — Rodar ESLint completo sem afrouxar regras** | `BLOCKED` | P0
  - Corrige: Detectar riscos de React/hooks e qualidade. Risco: Silenciar linter esconde bugs reais.
  - Critério PASS: npm run lint retorna 0 sem redução das regras. Pré-requisito: G1-02.
- [ ] **G1-06 — Rodar TypeScript completo** | `BLOCKED` | P0
  - Corrige: Detectar contratos e tipos incompatíveis. Risco: Casts inseguros escondem erros.
  - Critério PASS: npx --no-install tsc --noEmit retorna 0. Pré-requisito: G1-02.
- [ ] **G1-07 — Executar build Vite e verificar artefatos** | `BLOCKED` | P0
  - Corrige: Comprovar compilação para produção. Risco: Problemas SSR/hydration/rotas ainda ocultos.
  - Critério PASS: npm run build retorna 0 e gera cliente + handlers previstos. Pré-requisito: G1-05,G1-06.
- [ ] **G1-08 — Executar build:gated Netlify na mesma revisão** | `BLOCKED` | P0
  - Corrige: Comprovar todos os gates juntos. Risco: CI aceitar revisão diferente da testada.
  - Critério PASS: npm run build:gated retorna 0 e commit/hash registrados. Pré-requisito: G1-03,G1-04,G1-05,G1-06,G1-07.
- [ ] **G1-09 — Conferir mudanças do lockfile e fixar versões realmente necessárias** | `NOT RUN` | P1
  - Corrige: Reduzir supply-chain drift e divergências não intencionais. Risco: Atualização silenciosa de dependências e APIs.
  - Critério PASS: Diff limitado ao necessário, deps diretas alinhadas, nenhuma integridade inventada. Pré-requisito: G1-01.

### G2 — 2/13 PASS

- [ ] **G2-01 — Inventariar migrations e schema somente leitura** | `BLOCKED` | P0
  - Corrige: Evitar executar DDL incompatível com estado real. Risco: Migrations antigas podem reaplicar SQL/trigger.
  - Critério PASS: Inventário de staging e divergências documentados. Pré-requisito: G0-05.
- [ ] **G2-02 — Verificar UNIQUE/onConflict de contatos e presença** | `BLOCKED` | P0
  - Corrige: Prevenir SQL 42P10 e duplicação. Risco: Índice novo conflitar com registros históricos.
  - Critério PASS: Constraints staging correspondem às queries e fixtures E04/E07. Pré-requisito: G2-01.
- [ ] **G2-03 — Analisar colisões external_id em mensagens multi-instância** | `BLOCKED` | P0
  - Corrige: Eliminar deduplicação cruzada dentro do workspace. Risco: Alterar chave incorretamente pode perder dados ou multiplicar mensagens.
  - Critério PASS: Consulta read-only prova se há colisões e define migração versionada. Pré-requisito: G2-01.
  - Evidência: Diagnóstico SQL somente leitura preparado em scripts/sql; não executado sem staging. Índices/RPC legados analisados offline.
- [ ] **G2-04 — Projetar migração atômica de chave (workspace,instance,external)** | `NOT RUN` | P0
  - Corrige: Corrigir unicidade por instância quando schema/consultas confirmarem. Risco: Índice, RPC e queries não podem ser alterados isoladamente.
  - Critério PASS: Plano com pré-checagem, migração, compatibilidade, rollback e teste concorrente. Pré-requisito: G2-03.
  - Evidência: Esboço documentado em docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md. Migração SQL NÃO executada/criada; depende de staging real.
- [ ] **G2-05 — Testar RPC persist_inbox_message e buscas por instância** | `BLOCKED` | P0
  - Corrige: Evitar gravar ou editar mensagem na instância errada. Risco: Risco de regressão em upsert histórico, deletes e recibos.
  - Critério PASS: Mesmo ID externo em duas instâncias não cruza dados nem duplica na mesma. Pré-requisito: G2-04.
- [ ] **G2-06 — Reconciliar histórico e rodar migrations SOMENTE em staging** | `BLOCKED` | P0
  - Corrige: Validar reversibilidade e estado final do banco. Risco: DDL parcial, triggers duplicadas e bloqueios.
  - Critério PASS: Migrations de staging verdes, sem drift e rollback testado. Pré-requisito: G2-01,G2-02,G2-04.
- [ ] **G2-07 — Executar testes RLS com dois workspaces, duas instâncias** | `BLOCKED` | P0
  - Corrige: Comprovar isolamento verdadeiro além dos mocks. Risco: Cross-tenant por service_role, join ou IDOR.
  - Critério PASS: Dados A inacessíveis a B em chats, mídia, CRM, convite, agentes e exports. Pré-requisito: G2-06.
- [ ] **G2-08 — Concorrência do último owner/superadmin** | `BLOCKED` | P0
  - Corrige: Preservar ao menos um proprietário/administrador ativo. Risco: Race condition pode remover último privilegiado.
  - Critério PASS: Duas transações simultâneas não deixam zero privilegiados ativos. Pré-requisito: G2-06.
- [ ] **G2-09 — Validar transferência owner e revogação/suspensão** | `BLOCKED` | P0
  - Corrige: Garantir autorização atômica e sessões inválidas. Risco: Permissões ficam no cache após mudança.
  - Critério PASS: Transferência correta; token revogado/suspenso recebe negativa no request seguinte. Pré-requisito: G2-06.
- [ ] **G2-10 — Auditar bucket, assinatura de mídia e vault das integrações** | `BLOCKED` | P0
  - Corrige: Prevenir leak de imagem e credencial multi-tenant. Risco: URL assinada expõe recurso ou token em frontend.
  - Critério PASS: Apenas owner autorizado acessa mídia e segredos ficam server-side. Pré-requisito: G2-07.
- [ ] **G2-11 — Testar backup e restauração em staging** | `BLOCKED` | P0
  - Corrige: Garantir rollback de schema/dados sem improviso. Risco: Recuperação não funcionar em incidente.
  - Critério PASS: Backup/PITR demonstrado em ambiente de teste com tempos registrados. Pré-requisito: G2-06.
- [x] **G2-12 — Blindar mutações Evolution por instance_id no código** | `PASS` | P0
  - Corrige: Evitar edições, exclusões, reações e fotos cross-instance em mesmo workspace. Risco: Caller legada sem instance_id falha fechada; E2E e schema ainda não homologados.
  - Critério PASS: Guard obrigatório + filtros em buscas/updates + regressões offline aprovadas. Pré-requisito: G0-02.
  - Evidência: 4 novos testes evolução instance scope PASS; edições de evolution.server.ts e sync-engine.ts; sem alterações de banco
- [x] **G2-13 — Preparar SQL de diagnóstico read-only e projeto de migração** | `PASS` | P0
  - Corrige: Prevenir alteração insegura da UNIQUE antiga e planejar migração coordenada. Risco: Consulta em staging pode evidenciar divergências; análise offline não prova ausência de colisões.
  - Critério PASS: SQL sem DML/DDL + documento de pré-checagem/migração/rollback + testes estáticos. Pré-requisito: G0-02.
  - Evidência: scripts/sql/inspect-message-identity-readonly.sql + docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md; 2 testes PASS; staging NOT RUN

### G3 — 1/13 PASS

- [ ] **G3-01 — Homologar auth: cadastro, login, OTP, recuperação e sessões** | `BLOCKED` | P0
  - Corrige: Comprovar fluxos críticos de identidade. Risco: OTP reutilizável ou sessões não revogadas.
  - Critério PASS: HTTP 200/201, 401/403/409 conforme cenário; tokens expirados inválidos. Pré-requisito: G2-07,G1-08.
- [ ] **G3-02 — Testar papéis ADM e membros, convites e suspensão** | `BLOCKED` | P0
  - Corrige: Evitar escalada de privilégio e ações cruzadas. Risco: Rota ADM sem guard ou papel em cache.
  - Critério PASS: Papéis enforcement no servidor em todas as mutações. Pré-requisito: G3-01.
- [ ] **G3-03 — Testar ingress webhook: token, JSON, payload, rate-limit** | `BLOCKED` | P0
  - Corrige: Garantir fail-closed do endpoint público. Risco: Aceitação indevida/consumo excessivo.
  - Critério PASS: Casos 400/401/413/429/503 esperados sem efeitos colaterais. Pré-requisito: G2-06,G1-08.
- [ ] **G3-04 — Comprovar persistência e idempotência do webhook** | `BLOCKED` | P0
  - Corrige: Garantir queued→completed e não apenas HTTP 2xx. Risco: Duplicatas e falso sucesso em falha Supabase.
  - Critério PASS: Mesmo evento produz uma escrita e status coerente; erros viram failed/retry. Pré-requisito: G3-03.
- [ ] **G3-05 — Simular worker concorrente / CAS / dead-letter** | `BLOCKED` | P0
  - Corrige: Confirmar hotfix da Fase 11 sob concorrência. Risco: Mais retries podem aumentar fila em indisponibilidade.
  - Critério PASS: Somente worker com claim conclui; falhas de DB não finalizam evento. Pré-requisito: G3-04.
- [ ] **G3-06 — Revalidar recovery cron e limites de lote** | `BLOCKED` | P0
  - Corrige: Recuperar evento preso sem tempestade de execução. Risco: Backfill agressivo causa duplicatas ou resposta IA retroativa.
  - Critério PASS: Stale processing/failed recuperados sob política; nenhuma resposta retroativa. Pré-requisito: G3-05.
- [ ] **G3-07 — Testar outbox com dois envios do mesmo clientMessageId** | `BLOCKED` | P0
  - Corrige: Evitar mensagens duplicadas em race. Risco: Dois workers enviam simultaneamente.
  - Critério PASS: Apenas um envio remoto/aceitação com mesma chave idempotente. Pré-requisito: G3-05.
- [ ] **G3-08 — Testar timeout/408/5xx e reconciliação sem reenvio** | `BLOCKED` | P0
  - Corrige: Evitar retry cego quando resultado remoto é ambíguo. Risco: Mensagem enviada duas vezes.
  - Critério PASS: Estado unknown/accepted reconciliado por IDs, sem novo disparo. Pré-requisito: G3-07.
- [ ] **G3-09 — Validar mutation: edição/exclusão/reação/recibos** | `BLOCKED` | P0
  - Corrige: Evitar edição ou alteração de status da mensagem errada. Risco: Eventos atrasados regridem status ou cruzam instâncias.
  - Critério PASS: Mensagem correta, ordem preservada, READ não regrede. Pré-requisito: G3-04.
- [ ] **G3-10 — Validar contatos, chats, grupos e permissões sob E2E** | `BLOCKED` | P0
  - Corrige: Comprovar hotfix de grupos/cache em produção isolada. Risco: Cache stale e permissões indevidas em eventos fora de ordem.
  - Critério PASS: Mesmo JID em 2 workspaces/instâncias não contamina metadados. Pré-requisito: G3-04,G2-07.
- [ ] **G3-11 — Testar uploads, mídias e recibos com permissões** | `BLOCKED` | P1
  - Corrige: Garantir fluxo de arquivos e acesso correto. Risco: Payload acima do limite, assinatura inválida, upload indevido.
  - Critério PASS: Arquivos permitidos passam e inválidos falham sem escrita pública. Pré-requisito: G2-10,G3-09.
- [ ] **G3-12 — Cobrir contratos HTTP restantes com matriz de smoke** | `BLOCKED` | P1
  - Corrige: Detectar endpoints quebrados após migrações. Risco: Rotas com 500 apesar de build verde.
  - Critério PASS: Contratos críticos 2xx/4xx previsíveis e sem 500/tenant leak. Pré-requisito: G3-01,G3-04.
- [x] **G3-13 — Blindar execução de smoke sintético Evolution no preview** | `PASS` | P0
  - Corrige: Evitar POSTs sintéticos em produção, banco errado ou com respostas automáticas habilitadas. Risco: Confirmações do operador não provam a configuração efetiva do Deploy Preview; exigir verificação externa.
  - Critério PASS: Preflight fail-closed, segredos não logados, dry-run sem rede e regressões locais aprovadas. Pré-requisito: G0-02.
  - Evidência: scripts/lib/evolution-smoke-policy.mjs + 7 novos testes PASS (202/202 no total); execução remota NOT RUN

### G4 — 0/8 PASS

- [ ] **G4-01 — Confirmar versão/contrato real da Evolution API v2** | `BLOCKED` | P0
  - Corrige: Evitar incompatibilidade de payloads/eventos. Risco: Documentação de versão diferente mascarar falhas.
  - Critério PASS: Versão instalada e endpoints de webhook/QR validados. Pré-requisito: G0-06.
- [ ] **G4-02 — Testar QR, conexão, desconexão e reconexão** | `BLOCKED` | P0
  - Corrige: Comprovar lifecycle de conexão do painel. Risco: Reconfigurar instância produtiva por engano.
  - Critério PASS: Somente instância sandbox muda; UI, API e banco concordam. Pré-requisito: G4-01,G5-01.
- [ ] **G4-03 — Testar contatos @lid, grupos e atualização de participantes** | `BLOCKED` | P0
  - Corrige: Comprovar nome/foto, isolamento e canSend. Risco: Grupos abertos serem tratados como bloqueados.
  - Critério PASS: Cenários E04–E07/E12/E13 verdes com Evolution real. Pré-requisito: G4-01,G3-10.
- [ ] **G4-04 — Testar envio/recebimento e status de mensagens reais** | `BLOCKED` | P0
  - Corrige: Comprovar E2E de mensagens. Risco: Envio não persistir ou ser duplicado.
  - Critério PASS: Painel, banco e WhatsApp sandbox concordam com IDs/estado. Pré-requisito: G4-02,G3-08.
- [ ] **G4-05 — Testar mídia, edição, exclusão, reação e recibos** | `BLOCKED` | P0
  - Corrige: Cobrir eventos pouco testados. Risco: Falha silenciosa em mensagens alteradas.
  - Critério PASS: E08–E11/E20 aprovados e rastreados. Pré-requisito: G4-04.
- [ ] **G4-06 — Validar Groq sandbox, timeout e mensagens antigas** | `BLOCKED` | P1
  - Corrige: Evitar resposta automática retroativa. Risco: Resposta do agente para backlog antigo.
  - Critério PASS: IA não responde a eventos antigos ou duplicados. Pré-requisito: G4-04.
- [ ] **G4-07 — Validar Resend: OTP, recuperação e falha de entrega** | `BLOCKED` | P0
  - Corrige: Assegurar login e alertas. Risco: OTP não entregue ou reenviado em cascata.
  - Critério PASS: Emails chegam somente a caixas de teste, falhas tratadas. Pré-requisito: G3-01.
- [ ] **G4-08 — Validar newsletter com opt-in/opt-out em sandbox** | `BLOCKED` | P1
  - Corrige: Evitar envios e dados de marketing incorretos. Risco: Newsletter real enviada sem autorização.
  - Critério PASS: Agendamento/cancelamento/descadastro corretos em lista teste. Pré-requisito: G4-07.

### G5 — 0/9 PASS

- [ ] **G5-01 — Publicar Deploy Preview com ENV isoladas** | `BLOCKED` | P0
  - Corrige: Simular produção sem risco a clientes. Risco: Preview apontar Supabase/Evolution produtivos.
  - Critério PASS: URL preview, env do contexto e ref staging comprovados. Pré-requisito: G1-08,G0-05,G0-06,G0-07.
- [ ] **G5-02 — Bloquear escrita de webhook de produção em preview** | `BLOCKED` | P0
  - Corrige: Impedir alterações de webhook da instância real. Risco: Mensagem da produção roteada a preview.
  - Critério PASS: EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false; checagens de host e ref OK. Pré-requisito: G5-01.
- [ ] **G5-03 — Rodar audit:env sem revelar segredos** | `BLOCKED` | P0
  - Corrige: Comprovar vault/bootstrap/billing/env. Risco: Bootstrap admin ativo ou chave inválida.
  - Critério PASS: npm run audit:env PASS no contexto escolhido. Pré-requisito: G5-01.
- [ ] **G5-04 — Rodar synthetic smoke em dry-run e execução segura** | `BLOCKED` | P0
  - Corrige: Comprovar ingress por endereço público. Risco: Ensaio atingir produção ou ser tomado por E2E completo.
  - Critério PASS: Dry-run OK + --execute somente preview, status persistido no staging. Pré-requisito: G5-02,G3-04.
- [ ] **G5-05 — Executar test:integration e testes HTTP na URL preview** | `BLOCKED` | P0
  - Corrige: Detectar rotas quebradas de deploy. Risco: Resposta de mock diferente do runtime Netlify.
  - Critério PASS: TEST_BASE_URL preview; suíte de integração verde. Pré-requisito: G5-04,G3-12.
- [ ] **G5-06 — Conferir responsividade e interações 320–desktop** | `BLOCKED` | P1
  - Corrige: Prevenir bugs de viewport e teclado. Risco: Modais e rolagem podem travar no mobile.
  - Critério PASS: Flows de auth, inbox, CRM e ADM sem overflow/console errors. Pré-requisito: G5-01.
- [ ] **G5-07 — Testar cache, reconexão e falhas parciais de rede** | `BLOCKED` | P1
  - Corrige: Garantir que UI não mostre falso sucesso. Risco: Estado stale e envio duplicado por clique.
  - Critério PASS: Erros claros, retries seguros e dados atualizados após refresh. Pré-requisito: G5-05.
- [ ] **G5-08 — Instrumentar fila, erros 5xx, cron e logs redigidos** | `BLOCKED` | P0
  - Corrige: Detectar falha antes de atingir clientes. Risco: Backlog cresce silenciosamente.
  - Critério PASS: Métricas queued/failed/dead_letter, logs sem PII e alerta funcional. Pré-requisito: G5-04.
- [ ] **G5-09 — Testar rollback do deploy e restauração da operação** | `BLOCKED` | P0
  - Corrige: Reduzir tempo de recuperação após incidente. Risco: Rollback de app incompatível com schema alterado.
  - Critério PASS: Volta de preview reproduzida sem perder eventos. Pré-requisito: G2-11,G5-05.

### G6 — 0/7 PASS

- [ ] **G6-01 — Consolidar relatório de gates em uma revisão e evidências** | `NOT RUN` | P0
  - Corrige: Evitar aprovar commit diferente daquele testado. Risco: Testes de revisões distintas geram falso GO.
  - Critério PASS: G1–G5 comprovados no mesmo SHA, logs redigidos e datados. Pré-requisito: G1-08,G2-11,G5-09.
- [ ] **G6-02 — Auditar backlog real SOMENTE leitura após release validado** | `BLOCKED` | P0
  - Corrige: Estimar recuperação segura dos eventos acumulados. Risco: Reprocessar eventos antigos gera duplicação/IA retroativa.
  - Critério PASS: Contagens e causas atuais conhecidas, sem write em produção. Pré-requisito: G6-01.
  - Evidência: Snapshot 02/10 é histórico, não atualizado
- [ ] **G6-03 — Definir decisão GO/NO-GO e plano canário** | `BLOCKED` | P0
  - Corrige: Controlar risco de publicação. Risco: Lançamento com fila falhando ou rollback ausente.
  - Critério PASS: Todos G1–G5 PASS e nenhum bloqueio crítico. Pré-requisito: G6-01.
- [ ] **G6-04 — Obter autorização explícita específica para produção** | `BLOCKED` | P0
  - Corrige: Evitar mudanças não autorizadas. Risco: Deploy afeta clientes e dados reais.
  - Critério PASS: Aprovação do responsável registrada APÓS homologação. Pré-requisito: G6-03.
  - Evidência: Não autorizado
- [ ] **G6-05 — Publicar versão em produção com canário monitorado** | `BLOCKED` | P0
  - Corrige: Disponibilizar correções comprovadas. Risco: Regressão ao vivo e picos de fila.
  - Critério PASS: Deploy autorizado, health+fila estabilizados, rollback disponível. Pré-requisito: G6-04.
- [ ] **G6-06 — Solicitar autorização distinta para replay do backlog** | `BLOCKED` | P0
  - Corrige: Impedir disparo retroativo de milhares de eventos. Risco: Mensagens/IA duplicadas, custo e rate limit.
  - Critério PASS: Canário pequeno definido, revisão manual e autorização específica. Pré-requisito: G6-02,G6-05.
  - Evidência: Não autorizado
- [ ] **G6-07 — Executar replay seletivo canário e reavaliar métricas** | `BLOCKED` | P0
  - Corrige: Recuperar eventos com segurança. Risco: Backlog e mensagens podem ser amplificados.
  - Critério PASS: Sem duplicatas, métricas estáveis; sem batch integral. Pré-requisito: G6-06.

## Critério final GO/NO-GO

**NO-GO enquanto:** lockfile não regenerado pela ferramenta oficial, `npm ci`/build não aprovados, staging real não isolado, E2E não aprovados, RLS/conflitos de instância não verificados, rollback não ensaiado ou sem autorização de produção. O status G3-13 PASS significa **somente** preflight local, não E2E remoto.

### Pré-execução segura do smoke (apenas após preparar staging)

```bash
node scripts/evolution-preview-smoke.mjs  # sempre DRY RUN primeiro
# No secret store, definir EVOLUTION_STAGING_WEBHOOK_URL e TOKEN,
# EVOLUTION_STAGING_INSTANCE, EVOLUTION_STAGING_SUPABASE_REF,
# EVOLUTION_PRODUCTION_SUPABASE_REF, PRODUCTION_APP_URL,
# STAGING_ISOLATED_DB_CONFIRMED=yes,
# STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes
# Após conferir hospedagem, banco e agentes em staging:
node scripts/evolution-preview-smoke.mjs --execute
```

Não copiar tokens em scripts, planilhas ou relatórios. Nenhum `HTTP 2xx` confirma escrita persistida: validar os eventos no banco do staging.
