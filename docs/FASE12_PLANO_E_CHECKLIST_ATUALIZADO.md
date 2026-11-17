# InboxOS — Plano e checklist atualizado · Fase 12 / Rodada 2 (11/10/2026)

**Base oficial:** `inboxos-fase11-correcoes-offline-2026-10-11.zip` — SHA256 `aa64996f9c7ff2957e31e0006f4e146ed7b46de4537f3d8bb064ba191ecd7f3d`.
**Código entregue:** `inboxos-fase12-correcoes-scoping-2026-10-11.zip` · **produção:** NO-GO.

## Resultados verificados

- **195/195 testes locais PASS**; 6 novos (4 guardas/scoping, 2 SQL/documentação).
- **269 arquivos TS com parsing PASS**, imports locais e 83 rotas PASS; Billing OFF no código.
- **Lockfile FAIL:** seis divergências antigas permanecem; registry npm retornou `EAI_AGAIN`.
- **Não homologados:** `npm ci`, lint global, typecheck do projeto, Vite build, Netlify build, Supabase staging, Evolution real, Groq, Resend e E2E.
- **Mudança no banco/deploy:** nenhuma. Nenhum replay do backlog.

## O que foi realmente alterado (causa → mudança → risco)

1. **Edição, exclusão e reação por ID externo:** funções aceitavam instance_id opcional → agora exigem UUID válido e filtro composto por workspace + instância, inclusive no UPDATE. Risco: chamadas legadas sem ID falharão em vez de editar indiscriminadamente; todos os chamadores existentes foram auditados estaticamente.
2. **Foto/metadados de remetente durante sync:** UPDATE por workspace+sender_phone podia afetar outras instâncias → adicionado filtro por ownedInstance.id. Risco: atualizações antigas sem instance_id não serão mais alteradas em lote; validar staging.
3. **Chave UNIQUE do banco:** ainda é `(workspace_id,external_id)` → NÃO alterada por segurança. SQL diagnóstico somente leitura e desenho de migration coordenada foram escritos. Risco de deduplicação cross-instance ainda existe até a aprovação da migration/queries em staging.

## Checklist consolidado (PASS somente com evidência no escopo descrito)

### G0 — 4/7 tarefas locais aprovadas

- [x] **G0-01 — Verificar integridade da base da Fase 11** | PASS | P0
  - **Corrige:** Evitar continuar sobre pacote corrompido ou antigo. **Risco:** Mistura de versões, perda de correções.
  - **PASS quando:** ZIP abre sem erro e estrutura InboxOS identificada. **Depende:** —.
  - Evidência atual: ZipFile.testzip(): OK; 439 entradas no pacote da Fase 11
- [x] **G0-02 — Registrar snapshot imutável, hash e branch de trabalho** | PASS | P0
  - **Corrige:** Permitir comparação e rollback do código. **Risco:** Sobrescrever trabalho atual ou aplicar patch duas vezes.
  - **PASS quando:** Git branch/snapshot e SHA256 do ZIP registrado. **Depende:** G0-01.
  - Evidência atual: Snapshot ZIP imutável + diretório isolado; SHA256 aa64996f9c7ff2957e…; sem .git, não foi criada branch. docs/FASE12_SNAPSHOT_BASE_SHA256.md
- [x] **G0-03 — Conferir runtime Node e npm da revisão** | PASS | P0
  - **Corrige:** Fixar ambiente de build reprodutível. **Risco:** Versões diferentes geram dependências incompatíveis.
  - **PASS quando:** Node >=22.12.0 e npm 10.9.2 identificados. **Depende:** —.
  - Evidência atual: Node v22.16.0 / npm v10.9.2
- [x] **G0-04 — Confirmar Billing desligado no código** | PASS | P0
  - **Corrige:** Não ativar fluxo de cobrança fora de escopo. **Risco:** Assinaturas ou rotas financeiras expostas sem homologação.
  - **PASS quando:** audit:release confirma proteção de Billing OFF. **Depende:** —.
  - Evidência atual: PASS em auditoria 11/10/2026; flags de deploy ainda pendentes
- [ ] **G0-05 — Preparar Supabase staging com project ref distinto** | BLOCKED | P0
  - **Corrige:** Evitar escrever no banco de produção durante E2E. **Risco:** Dano em dados reais e migração irreversível.
  - **PASS quando:** Ref de staging e credenciais segregadas comprovadas. **Depende:** G0-02.
  - Evidência atual: Staging não fornecido
- [ ] **G0-06 — Preparar Evolution v2 + contas de teste autorizadas** | BLOCKED | P0
  - **Corrige:** Garantir troca de mensagens sem atingir clientes. **Risco:** Mensagens e webhooks atingirem produção.
  - **PASS quando:** Instância e números exclusivos para testes, separados do produção. **Depende:** G0-05.
  - Evidência atual: Ambiente de teste não fornecido
- [ ] **G0-07 — Configurar segredos e contexto de preview sem valores em logs** | BLOCKED | P0
  - **Corrige:** Separar serviço, vault e client env. **Risco:** Vazamento de service_role, API keys, tokens ou redirecionamento.
  - **PASS quando:** ENV presentes no secret store, sem valores expostos; preview aponta somente para staging. **Depende:** G0-05.
  - Evidência atual: ENV reais indisponíveis

### G1 — 1/9 tarefas locais aprovadas

- [ ] **G1-01 — Corrigir seis divergências de package-lock com npm oficial** | FAIL | P0
  - **Corrige:** Restabelecer resolução determinística de dependências. **Risco:** Atualizações transitivas inesperadas ou quebra do adaptador Netlify.
  - **PASS quando:** npm install --package-lock-only; diff revisado; audit:release sem divergências. **Depende:** G0-02.
  - Evidência atual: npm view @netlify/vite-plugin-tanstack-start@1.3.19 → EAI_AGAIN; lockfile não alterado; continuam 6 divergências.
- [ ] **G1-02 — Executar npm ci em instalação limpa** | BLOCKED | P0
  - **Corrige:** Comprovar que dependências se instalam a partir do lock. **Risco:** Optional deps incompatíveis ou download parcial.
  - **PASS quando:** npm ci --include=dev --include=optional sai 0. **Depende:** G1-01.
  - Evidência atual: Registry npm inacessível (EAI_AGAIN); npm ci sem PASS neste ambiente.
- [x] **G1-03 — Reexecutar testes unitários e regressão** | PASS | P0
  - **Corrige:** Garantir que hotfixes existentes não regrediram. **Risco:** Novo pacote poderia alterar fixtures ou carregadores.
  - **PASS quando:** npm test na versão final Fase 12 retorna 195/195; repetir após corrigir lockfile. **Depende:** G0-01.
  - Evidência atual: Fase 12, npm test: 195/195 PASS (189+6); log INBOXOS_FASE12_TEST_2026-10-11.log. Repetir após reparo do lock.
- [ ] **G1-04 — Auditoria release: parsing, imports, rotas, Billing e lockfile** | FAIL | P0
  - **Corrige:** Confirmar integridade estrutural antes da compilação. **Risco:** Ignorar falhas restantes por falso positivo.
  - **PASS quando:** npm run audit:release retorna 0 em TODAS as checagens. **Depende:** G1-01.
  - Evidência atual: Fase12: audit:release FAIL 6 divergências no lock; PASS parser 269 TS, 83 rotas, imports e Billing OFF.
- [ ] **G1-05 — Rodar ESLint completo sem afrouxar regras** | BLOCKED | P0
  - **Corrige:** Detectar riscos de React/hooks e qualidade. **Risco:** Silenciar linter esconde bugs reais.
  - **PASS quando:** npm run lint retorna 0 sem redução das regras. **Depende:** G1-02.
- [ ] **G1-06 — Rodar TypeScript completo** | BLOCKED | P0
  - **Corrige:** Detectar contratos e tipos incompatíveis. **Risco:** Casts inseguros escondem erros.
  - **PASS quando:** npx --no-install tsc --noEmit retorna 0. **Depende:** G1-02.
- [ ] **G1-07 — Executar build Vite e verificar artefatos** | BLOCKED | P0
  - **Corrige:** Comprovar compilação para produção. **Risco:** Problemas SSR/hydration/rotas ainda ocultos.
  - **PASS quando:** npm run build retorna 0 e gera cliente + handlers previstos. **Depende:** G1-05,G1-06.
- [ ] **G1-08 — Executar build:gated Netlify na mesma revisão** | BLOCKED | P0
  - **Corrige:** Comprovar todos os gates juntos. **Risco:** CI aceitar revisão diferente da testada.
  - **PASS quando:** npm run build:gated retorna 0 e commit/hash registrados. **Depende:** G1-03,G1-04,G1-05,G1-06,G1-07.
- [ ] **G1-09 — Conferir mudanças do lockfile e fixar versões realmente necessárias** | NOT RUN | P1
  - **Corrige:** Reduzir supply-chain drift e divergências não intencionais. **Risco:** Atualização silenciosa de dependências e APIs.
  - **PASS quando:** Diff limitado ao necessário, deps diretas alinhadas, nenhuma integridade inventada. **Depende:** G1-01.

### G2 — 2/13 tarefas locais aprovadas

- [ ] **G2-01 — Inventariar migrations e schema somente leitura** | BLOCKED | P0
  - **Corrige:** Evitar executar DDL incompatível com estado real. **Risco:** Migrations antigas podem reaplicar SQL/trigger.
  - **PASS quando:** Inventário de staging e divergências documentados. **Depende:** G0-05.
- [ ] **G2-02 — Verificar UNIQUE/onConflict de contatos e presença** | BLOCKED | P0
  - **Corrige:** Prevenir SQL 42P10 e duplicação. **Risco:** Índice novo conflitar com registros históricos.
  - **PASS quando:** Constraints staging correspondem às queries e fixtures E04/E07. **Depende:** G2-01.
- [ ] **G2-03 — Analisar colisões external_id em mensagens multi-instância** | BLOCKED | P0
  - **Corrige:** Eliminar deduplicação cruzada dentro do workspace. **Risco:** Alterar chave incorretamente pode perder dados ou multiplicar mensagens.
  - **PASS quando:** Consulta read-only prova se há colisões e define migração versionada. **Depende:** G2-01.
  - Evidência atual: Diagnóstico SQL somente leitura preparado em scripts/sql; não executado sem staging. Índices/RPC legados analisados offline.
- [ ] **G2-04 — Projetar migração atômica de chave (workspace,instance,external)** | NOT RUN | P0
  - **Corrige:** Corrigir unicidade por instância quando schema/consultas confirmarem. **Risco:** Índice, RPC e queries não podem ser alterados isoladamente.
  - **PASS quando:** Plano com pré-checagem, migração, compatibilidade, rollback e teste concorrente. **Depende:** G2-03.
  - Evidência atual: Esboço documentado em docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md. Migração SQL NÃO executada/criada; depende de staging real.
- [ ] **G2-05 — Testar RPC persist_inbox_message e buscas por instância** | BLOCKED | P0
  - **Corrige:** Evitar gravar ou editar mensagem na instância errada. **Risco:** Risco de regressão em upsert histórico, deletes e recibos.
  - **PASS quando:** Mesmo ID externo em duas instâncias não cruza dados nem duplica na mesma. **Depende:** G2-04.
- [ ] **G2-06 — Reconciliar histórico e rodar migrations SOMENTE em staging** | BLOCKED | P0
  - **Corrige:** Validar reversibilidade e estado final do banco. **Risco:** DDL parcial, triggers duplicadas e bloqueios.
  - **PASS quando:** Migrations de staging verdes, sem drift e rollback testado. **Depende:** G2-01,G2-02,G2-04.
- [ ] **G2-07 — Executar testes RLS com dois workspaces, duas instâncias** | BLOCKED | P0
  - **Corrige:** Comprovar isolamento verdadeiro além dos mocks. **Risco:** Cross-tenant por service_role, join ou IDOR.
  - **PASS quando:** Dados A inacessíveis a B em chats, mídia, CRM, convite, agentes e exports. **Depende:** G2-06.
- [ ] **G2-08 — Concorrência do último owner/superadmin** | BLOCKED | P0
  - **Corrige:** Preservar ao menos um proprietário/administrador ativo. **Risco:** Race condition pode remover último privilegiado.
  - **PASS quando:** Duas transações simultâneas não deixam zero privilegiados ativos. **Depende:** G2-06.
- [ ] **G2-09 — Validar transferência owner e revogação/suspensão** | BLOCKED | P0
  - **Corrige:** Garantir autorização atômica e sessões inválidas. **Risco:** Permissões ficam no cache após mudança.
  - **PASS quando:** Transferência correta; token revogado/suspenso recebe negativa no request seguinte. **Depende:** G2-06.
- [ ] **G2-10 — Auditar bucket, assinatura de mídia e vault das integrações** | BLOCKED | P0
  - **Corrige:** Prevenir leak de imagem e credencial multi-tenant. **Risco:** URL assinada expõe recurso ou token em frontend.
  - **PASS quando:** Apenas owner autorizado acessa mídia e segredos ficam server-side. **Depende:** G2-07.
- [ ] **G2-11 — Testar backup e restauração em staging** | BLOCKED | P0
  - **Corrige:** Garantir rollback de schema/dados sem improviso. **Risco:** Recuperação não funcionar em incidente.
  - **PASS quando:** Backup/PITR demonstrado em ambiente de teste com tempos registrados. **Depende:** G2-06.
- [x] **G2-12 — Blindar mutações Evolution por instance_id no código** | PASS | P0
  - **Corrige:** Evitar edições, exclusões, reações e fotos cross-instance em mesmo workspace. **Risco:** Caller legada sem instance_id falha fechada; E2E e schema ainda não homologados.
  - **PASS quando:** Guard obrigatório + filtros em buscas/updates + regressões offline aprovadas. **Depende:** G0-02.
  - Evidência atual: 4 novos testes evolução instance scope PASS; edições de evolution.server.ts e sync-engine.ts; sem alterações de banco
- [x] **G2-13 — Preparar SQL de diagnóstico read-only e projeto de migração** | PASS | P0
  - **Corrige:** Prevenir alteração insegura da UNIQUE antiga e planejar migração coordenada. **Risco:** Consulta em staging pode evidenciar divergências; análise offline não prova ausência de colisões.
  - **PASS quando:** SQL sem DML/DDL + documento de pré-checagem/migração/rollback + testes estáticos. **Depende:** G0-02.
  - Evidência atual: scripts/sql/inspect-message-identity-readonly.sql + docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md; 2 testes PASS; staging NOT RUN

### G3 — 0/12 tarefas locais aprovadas

- [ ] **G3-01 — Homologar auth: cadastro, login, OTP, recuperação e sessões** | BLOCKED | P0
  - **Corrige:** Comprovar fluxos críticos de identidade. **Risco:** OTP reutilizável ou sessões não revogadas.
  - **PASS quando:** HTTP 200/201, 401/403/409 conforme cenário; tokens expirados inválidos. **Depende:** G2-07,G1-08.
- [ ] **G3-02 — Testar papéis ADM e membros, convites e suspensão** | BLOCKED | P0
  - **Corrige:** Evitar escalada de privilégio e ações cruzadas. **Risco:** Rota ADM sem guard ou papel em cache.
  - **PASS quando:** Papéis enforcement no servidor em todas as mutações. **Depende:** G3-01.
- [ ] **G3-03 — Testar ingress webhook: token, JSON, payload, rate-limit** | BLOCKED | P0
  - **Corrige:** Garantir fail-closed do endpoint público. **Risco:** Aceitação indevida/consumo excessivo.
  - **PASS quando:** Casos 400/401/413/429/503 esperados sem efeitos colaterais. **Depende:** G2-06,G1-08.
- [ ] **G3-04 — Comprovar persistência e idempotência do webhook** | BLOCKED | P0
  - **Corrige:** Garantir queued→completed e não apenas HTTP 2xx. **Risco:** Duplicatas e falso sucesso em falha Supabase.
  - **PASS quando:** Mesmo evento produz uma escrita e status coerente; erros viram failed/retry. **Depende:** G3-03.
- [ ] **G3-05 — Simular worker concorrente / CAS / dead-letter** | BLOCKED | P0
  - **Corrige:** Confirmar hotfix da Fase 11 sob concorrência. **Risco:** Mais retries podem aumentar fila em indisponibilidade.
  - **PASS quando:** Somente worker com claim conclui; falhas de DB não finalizam evento. **Depende:** G3-04.
- [ ] **G3-06 — Revalidar recovery cron e limites de lote** | BLOCKED | P0
  - **Corrige:** Recuperar evento preso sem tempestade de execução. **Risco:** Backfill agressivo causa duplicatas ou resposta IA retroativa.
  - **PASS quando:** Stale processing/failed recuperados sob política; nenhuma resposta retroativa. **Depende:** G3-05.
- [ ] **G3-07 — Testar outbox com dois envios do mesmo clientMessageId** | BLOCKED | P0
  - **Corrige:** Evitar mensagens duplicadas em race. **Risco:** Dois workers enviam simultaneamente.
  - **PASS quando:** Apenas um envio remoto/aceitação com mesma chave idempotente. **Depende:** G3-05.
- [ ] **G3-08 — Testar timeout/408/5xx e reconciliação sem reenvio** | BLOCKED | P0
  - **Corrige:** Evitar retry cego quando resultado remoto é ambíguo. **Risco:** Mensagem enviada duas vezes.
  - **PASS quando:** Estado unknown/accepted reconciliado por IDs, sem novo disparo. **Depende:** G3-07.
- [ ] **G3-09 — Validar mutation: edição/exclusão/reação/recibos** | BLOCKED | P0
  - **Corrige:** Evitar edição ou alteração de status da mensagem errada. **Risco:** Eventos atrasados regridem status ou cruzam instâncias.
  - **PASS quando:** Mensagem correta, ordem preservada, READ não regrede. **Depende:** G3-04.
- [ ] **G3-10 — Validar contatos, chats, grupos e permissões sob E2E** | BLOCKED | P0
  - **Corrige:** Comprovar hotfix de grupos/cache em produção isolada. **Risco:** Cache stale e permissões indevidas em eventos fora de ordem.
  - **PASS quando:** Mesmo JID em 2 workspaces/instâncias não contamina metadados. **Depende:** G3-04,G2-07.
- [ ] **G3-11 — Testar uploads, mídias e recibos com permissões** | BLOCKED | P1
  - **Corrige:** Garantir fluxo de arquivos e acesso correto. **Risco:** Payload acima do limite, assinatura inválida, upload indevido.
  - **PASS quando:** Arquivos permitidos passam e inválidos falham sem escrita pública. **Depende:** G2-10,G3-09.
- [ ] **G3-12 — Cobrir contratos HTTP restantes com matriz de smoke** | BLOCKED | P1
  - **Corrige:** Detectar endpoints quebrados após migrações. **Risco:** Rotas com 500 apesar de build verde.
  - **PASS quando:** Contratos críticos 2xx/4xx previsíveis e sem 500/tenant leak. **Depende:** G3-01,G3-04.

### G4 — 0/8 tarefas locais aprovadas

- [ ] **G4-01 — Confirmar versão/contrato real da Evolution API v2** | BLOCKED | P0
  - **Corrige:** Evitar incompatibilidade de payloads/eventos. **Risco:** Documentação de versão diferente mascarar falhas.
  - **PASS quando:** Versão instalada e endpoints de webhook/QR validados. **Depende:** G0-06.
- [ ] **G4-02 — Testar QR, conexão, desconexão e reconexão** | BLOCKED | P0
  - **Corrige:** Comprovar lifecycle de conexão do painel. **Risco:** Reconfigurar instância produtiva por engano.
  - **PASS quando:** Somente instância sandbox muda; UI, API e banco concordam. **Depende:** G4-01,G5-01.
- [ ] **G4-03 — Testar contatos @lid, grupos e atualização de participantes** | BLOCKED | P0
  - **Corrige:** Comprovar nome/foto, isolamento e canSend. **Risco:** Grupos abertos serem tratados como bloqueados.
  - **PASS quando:** Cenários E04–E07/E12/E13 verdes com Evolution real. **Depende:** G4-01,G3-10.
- [ ] **G4-04 — Testar envio/recebimento e status de mensagens reais** | BLOCKED | P0
  - **Corrige:** Comprovar E2E de mensagens. **Risco:** Envio não persistir ou ser duplicado.
  - **PASS quando:** Painel, banco e WhatsApp sandbox concordam com IDs/estado. **Depende:** G4-02,G3-08.
- [ ] **G4-05 — Testar mídia, edição, exclusão, reação e recibos** | BLOCKED | P0
  - **Corrige:** Cobrir eventos pouco testados. **Risco:** Falha silenciosa em mensagens alteradas.
  - **PASS quando:** E08–E11/E20 aprovados e rastreados. **Depende:** G4-04.
- [ ] **G4-06 — Validar Groq sandbox, timeout e mensagens antigas** | BLOCKED | P1
  - **Corrige:** Evitar resposta automática retroativa. **Risco:** Resposta do agente para backlog antigo.
  - **PASS quando:** IA não responde a eventos antigos ou duplicados. **Depende:** G4-04.
- [ ] **G4-07 — Validar Resend: OTP, recuperação e falha de entrega** | BLOCKED | P0
  - **Corrige:** Assegurar login e alertas. **Risco:** OTP não entregue ou reenviado em cascata.
  - **PASS quando:** Emails chegam somente a caixas de teste, falhas tratadas. **Depende:** G3-01.
- [ ] **G4-08 — Validar newsletter com opt-in/opt-out em sandbox** | BLOCKED | P1
  - **Corrige:** Evitar envios e dados de marketing incorretos. **Risco:** Newsletter real enviada sem autorização.
  - **PASS quando:** Agendamento/cancelamento/descadastro corretos em lista teste. **Depende:** G4-07.

### G5 — 0/9 tarefas locais aprovadas

- [ ] **G5-01 — Publicar Deploy Preview com ENV isoladas** | BLOCKED | P0
  - **Corrige:** Simular produção sem risco a clientes. **Risco:** Preview apontar Supabase/Evolution produtivos.
  - **PASS quando:** URL preview, env do contexto e ref staging comprovados. **Depende:** G1-08,G0-05,G0-06,G0-07.
- [ ] **G5-02 — Bloquear escrita de webhook de produção em preview** | BLOCKED | P0
  - **Corrige:** Impedir alterações de webhook da instância real. **Risco:** Mensagem da produção roteada a preview.
  - **PASS quando:** EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false; checagens de host e ref OK. **Depende:** G5-01.
- [ ] **G5-03 — Rodar audit:env sem revelar segredos** | BLOCKED | P0
  - **Corrige:** Comprovar vault/bootstrap/billing/env. **Risco:** Bootstrap admin ativo ou chave inválida.
  - **PASS quando:** npm run audit:env PASS no contexto escolhido. **Depende:** G5-01.
- [ ] **G5-04 — Rodar synthetic smoke em dry-run e execução segura** | BLOCKED | P0
  - **Corrige:** Comprovar ingress por endereço público. **Risco:** Ensaio atingir produção ou ser tomado por E2E completo.
  - **PASS quando:** Dry-run OK + --execute somente preview, status persistido no staging. **Depende:** G5-02,G3-04.
- [ ] **G5-05 — Executar test:integration e testes HTTP na URL preview** | BLOCKED | P0
  - **Corrige:** Detectar rotas quebradas de deploy. **Risco:** Resposta de mock diferente do runtime Netlify.
  - **PASS quando:** TEST_BASE_URL preview; suíte de integração verde. **Depende:** G5-04,G3-12.
- [ ] **G5-06 — Conferir responsividade e interações 320–desktop** | BLOCKED | P1
  - **Corrige:** Prevenir bugs de viewport e teclado. **Risco:** Modais e rolagem podem travar no mobile.
  - **PASS quando:** Flows de auth, inbox, CRM e ADM sem overflow/console errors. **Depende:** G5-01.
- [ ] **G5-07 — Testar cache, reconexão e falhas parciais de rede** | BLOCKED | P1
  - **Corrige:** Garantir que UI não mostre falso sucesso. **Risco:** Estado stale e envio duplicado por clique.
  - **PASS quando:** Erros claros, retries seguros e dados atualizados após refresh. **Depende:** G5-05.
- [ ] **G5-08 — Instrumentar fila, erros 5xx, cron e logs redigidos** | BLOCKED | P0
  - **Corrige:** Detectar falha antes de atingir clientes. **Risco:** Backlog cresce silenciosamente.
  - **PASS quando:** Métricas queued/failed/dead_letter, logs sem PII e alerta funcional. **Depende:** G5-04.
- [ ] **G5-09 — Testar rollback do deploy e restauração da operação** | BLOCKED | P0
  - **Corrige:** Reduzir tempo de recuperação após incidente. **Risco:** Rollback de app incompatível com schema alterado.
  - **PASS quando:** Volta de preview reproduzida sem perder eventos. **Depende:** G2-11,G5-05.

### G6 — 0/7 tarefas locais aprovadas

- [ ] **G6-01 — Consolidar relatório de gates em uma revisão e evidências** | NOT RUN | P0
  - **Corrige:** Evitar aprovar commit diferente daquele testado. **Risco:** Testes de revisões distintas geram falso GO.
  - **PASS quando:** G1–G5 comprovados no mesmo SHA, logs redigidos e datados. **Depende:** G1-08,G2-11,G5-09.
- [ ] **G6-02 — Auditar backlog real SOMENTE leitura após release validado** | BLOCKED | P0
  - **Corrige:** Estimar recuperação segura dos eventos acumulados. **Risco:** Reprocessar eventos antigos gera duplicação/IA retroativa.
  - **PASS quando:** Contagens e causas atuais conhecidas, sem write em produção. **Depende:** G6-01.
  - Evidência atual: Snapshot 02/10 é histórico, não atualizado
- [ ] **G6-03 — Definir decisão GO/NO-GO e plano canário** | BLOCKED | P0
  - **Corrige:** Controlar risco de publicação. **Risco:** Lançamento com fila falhando ou rollback ausente.
  - **PASS quando:** Todos G1–G5 PASS e nenhum bloqueio crítico. **Depende:** G6-01.
- [ ] **G6-04 — Obter autorização explícita específica para produção** | BLOCKED | P0
  - **Corrige:** Evitar mudanças não autorizadas. **Risco:** Deploy afeta clientes e dados reais.
  - **PASS quando:** Aprovação do responsável registrada APÓS homologação. **Depende:** G6-03.
  - Evidência atual: Não autorizado
- [ ] **G6-05 — Publicar versão em produção com canário monitorado** | BLOCKED | P0
  - **Corrige:** Disponibilizar correções comprovadas. **Risco:** Regressão ao vivo e picos de fila.
  - **PASS quando:** Deploy autorizado, health+fila estabilizados, rollback disponível. **Depende:** G6-04.
- [ ] **G6-06 — Solicitar autorização distinta para replay do backlog** | BLOCKED | P0
  - **Corrige:** Impedir disparo retroativo de milhares de eventos. **Risco:** Mensagens/IA duplicadas, custo e rate limit.
  - **PASS quando:** Canário pequeno definido, revisão manual e autorização específica. **Depende:** G6-02,G6-05.
  - Evidência atual: Não autorizado
- [ ] **G6-07 — Executar replay seletivo canário e reavaliar métricas** | BLOCKED | P0
  - **Corrige:** Recuperar eventos com segurança. **Risco:** Backlog e mensagens podem ser amplificados.
  - **PASS quando:** Sem duplicatas, métricas estáveis; sem batch integral. **Depende:** G6-06.

## Decisão de release

Continua **NO-GO**, independente dos testes locais. G1 obrigatório (lockfile oficial, npm ci, lint, typecheck, builds), G2–G5 reais em staging e GO operacional exigem evidência da mesma revisão. Produção e replay de backlog exigem autorizações **separadas**.

Documentos internos anexos: `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md`, `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`, `scripts/sql/inspect-message-identity-readonly.sql`.
