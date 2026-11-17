# INBOXOS — MASTER HANDOFF FASE 16 / ANTIGRAVITY + CODEX

> Documento de continuidade técnico. Fonte de verdade: ZIP da Fase 16. O bloco histórico F15 incluído ao final é apenas consulta; não sobrepõe a F16.
> Data-base: 11/10/2026. Escopo da F16: frontend, UI/UX, acessibilidade, estados de falha e isolamento de estado. Nenhum backend, banco ou deployment modificado.

## 0. STATUS REAL — LEIA ANTES DE QUALQUER IMPLEMENTAÇÃO

| Gate | Estado | Evidência / interpretação |
|---|---|---|
| Testes Node | **PASS 233/233** | `npm test`: 220 da F15 + 13 novos F16; 3 testes de helper puro, 10 contratos de fonte / DOM proposto |
| Parsing TS/TSX/MTS | PASS (270 arquivos) | `npm run audit:release`: parser estático, NÃO typecheck global |
| Imports relativos + alias | PASS | mesmo audit; 0 imports locais ausentes |
| Árvore de rotas | PASS (83 rotas) | mesmo audit |
| Core Billing OFF | PASS | auditoria estática |
| Lockfile npm | **FAIL (6 inconsistências)** | npm root lock divergente do package.json |
| `npm ci --offline` | BLOCKED | ENOTCACHED para @netlify/vite-plugin-tanstack-start |
| ESLint | BLOCKED | `eslint: not found` |
| TypeScript completo | BLOCKED | TS2688: falta `vite/client` |
| Vite build | BLOCKED | `vite: not found` |
| Navegador + screenshots | NOT RUN | aplicação não compilada |
| Staging isolado | NOT RUN | não conectamos credenciais nem alteramos ambiente |
| Evolution E2E E01–E22 | NOT RUN | sem conexão com instância isolada |
| Publicação | **NO-GO** | proibir até aprovar os gates e autorização explícita |

### Divergências exatas do lockfile (não alterar manualmente)

1. `@lovable.dev/mcp-js` no lock, mas não declarado nas dependências.
2. `@sentry/cloudflare` no lock, mas não declarado.
3. `@netlify/vite-plugin-tanstack-start` ausente/divergente no pacote raiz do lock.
4. `@netlify/vite-plugin-tanstack-start` declarado no projeto mas não presente corretamente no lock.
5. `@lovable.dev/vite-tanstack-config` no lock, não declarado.
6. `nitro` no lock, não declarado.

**Correção autorizada em G1:** em ambiente com acesso oficial ao npm, versionar Node 22/npm 10.9.2 conforme engines, usar `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, revisar o diff de lock, `npm ci --include=dev --include=optional`, depois `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run build:gated` com variáveis de staging corretas. Se houver novas falhas reais, abrir tickets separados. NÃO presumir que apenas lockfile basta.

## 1. O QUE FOI ALTERADO NA FASE 16 — INVENTÁRIO COM CAUSA E TESTE

| ID | Arquivo | Falha anterior | Mudança F16 | Risco residual / teste |
|---|---|---|---|---|
| UI16-01 | `src/features/inbox/hooks/chat-scoped-update.ts` (NOVO) | request de chat antigo podia atualizar lista do chat atual | helper puro retorna lista visível e cache alvo com escopos separados | testar A→B→A e erro de rede no browser |
| UI16-02 | `src/features/inbox/hooks/useMessages.ts` | updater global de `setMessages` usava `prev` de conversa corrente para id alvo antigo | usa helper + cache correto, guard após `res.json()` | validar eventos em tempo real e múltiplas páginas |
| UI16-03 | `src/features/inbox/components/InboxShell.tsx` | erro de histórico invisível, preferência de tema não persistida, resposta nova apagada por envio antigo | `error`/`onRetry`, tema persistido apenas depois de ler localStorage/StrictMode, guarda de chat para limpar quote | verificar SSR, StrictMode, trocar conversa com envio em curso |
| UI16-04 | `src/features/inbox/components/MessageTimeline.tsx` | erro de rede confundido com tela sem mensagens | alerta `role=alert`, retry, preserva cache e não apresenta falso empty-state | validar cursor de histórico antigo; retry hoje atualiza latest |
| UI16-05 | `src/features/inbox/components/ChatHeader.tsx` | menu fechava no mouseleave, sem Escape/click fora e sem foco controlado; fallback de avatar podia persistir após foto nova | dismiss por pointerdown externo/Escape + foco primeiro botão e retorno ao gatilho; reset de fallback ao mudar URL | confirmar touch, perfil modal e movimento de foco |
| UI16-06 | `src/features/inbox/components/ConversationRow.tsx` | fallback da foto podia ficar mesmo após URL mudar; seleção somente visual | reset no avatar novo, `aria-current` na conversa selecionada | verificar leitores de tela e troca rápida de chats |
| UI16-07 | `src/features/inbox/components/MessageComposer.tsx` | quote em tema claro pouco legível; tecla Escape em anexos não restaurava foco | contraste condicionado ao tema, alvo de cancelar, foco inicial no menu e retorno ao botão | testar foto/documento por teclado e mobile |
| UI16-08 | `src/features/inbox/components/BusinessProfileModal.tsx` | modal sem trap Tab, rótulo programático, retorno de foco e nome no botão fechar | foco controlado, aria-labelledby, Escape, restauração e hit target | verificar reload de perfil e sobreposição de modais |
| UI16-09 | `src/features/inbox/components/AccountsSidebar.tsx` | erro de sincronização podia gerar rejeição sem feedback; controles por ícone sem descrição | toast de erro, `aria-label`/`aria-pressed` | testar contas e reconciliação real |
| UI16-10 | `src/features/media/components/MediaPreviewModal.tsx` | clicar no nome de arquivo podia fechar preview inadvertidamente | clique fecha somente no fundo, não em descendentes | confirmar teclado, vídeo e documentos |
| UI16-11 | `src/features/inbox/components/SettingsView.tsx` | ações 36px e rótulos de 10–11px em telas densas | botão primário 44px, labels e descrição mais legíveis | validar wrap do grid e scroll em 320px |
| UI16-12 | `src/styles.css` | alvo de toque pequeno no cabeçalho e topbar mobile | 44px para cabeçalho e ações prioritárias; 40px em chat header nas menores telas para evitar overflow | testar 320px + 200% zoom |
| UI16-13 | `tests/uiux-phase16.test.ts`, `package.json` | cenários sem regressão específica | 13 novos testes, três deles executam helper puro em Node | contratos de fonte NÃO substituem Playwright |
| UI16-14 | `AGENTS.md`, `.agents/rules/`, `.agents/skills/`, `ANTIGRAVITY_INICIO_FASE16.md` | documentação apontava F15 como checkpoint | regras persistentes F16 e skill de design atualizada | confirmar reconhecimento das skills no Antigravity |

## 2. RISCOS QUE EXIGEM QA DE NAVEGADOR (NÃO MARCAR PASS SEM EVIDÊNCIA)

### Chat e histórico
- Alternar conversa A → B com envio de texto/anexo no A ainda pendente; ao resolver, apenas cache/linha do A devem mudar.
- Iniciar resposta citada no B enquanto o envio do A resolve; quote do B não deve sumir.
- Sem rede em GET mensagens: exibir erro + `Tentar novamente`, nunca `Nenhuma mensagem` se houve falha.
- Reativar conexão e clicar retry; cache pré-existente preservado.
- Recebimento websocket de outra instância/workspace não altera chat atual.
- Paginação de histórico para cima conserva scroll quando bem-sucedida e deve ser testada quando falhar.
- Fluxos de mensagem failed + retry, conteúdo otimista e de-dupe por IDs.
- Imagens, áudio, documentos, stories/stickers e quoted messages em temas claro/escuro.

### Interações / acessibilidade
- Teclado: Tab/Shift+Tab, Enter, Space, Escape, foco visível, ausência de keyboard traps fora de modal.
- Menu de ação no cabeçalho: abrir por teclado, focar primeiro item, Escape retornar ao botão, clique externo fechar.
- Menu anexos: foco inicial, Escape, escolher tipo de arquivo com teclado.
- Dialog de perfil comercial: aria-labelledby, Tab preso, Escape e retorno ao elemento que abriu.
- MediaPreview: clicar nome de arquivo não fecha; clique backdrop fecha; vídeo controls funcionam.
- Header com foto quebrada, foto atualizada e placeholder sem flashes persistentes.
- Contraste do texto da citação em tema claro, dark, hover, focus e disabled.
- Preferência dark/light persistida após refresh inclusive com StrictMode; SSR sem warning de hidratação.
- Sidebar hover/focus, pin expandida, controles com rótulos, erro de sincronização visível.
- Navegar em Settings com leitor de tela e aumentar zoom a 200%.

### Grade de dispositivos OBRIGATÓRIA

| Viewport | Orientação/Zoom | Telas | Evidência necessária |
|---|---|---|---|
| 320×640 | portrait, 100% e 200% | inbox, lista, composer, auth, settings, diálogo | screenshot/console/overflow |
| 360×780 | portrait | idem + galeria e QR | screenshot, fluxo teclado |
| 390×844 | portrait (iPhone) | idem + safe area | screenshot, teclado virtual |
| 768×1024 | tablet portrait | shell, sidebar, chat, ADM, CRM | screenshot/sem scroll duplo |
| 1024×768 | tablet landscape | header, menu, list, composer | screenshot |
| 1440×900 | desktop | todas as vistas + dark/light | screenshot + logs |
| 390×700 | landscape/altura curta conforme possível | dock, modal, teclado | screenshot |

Observar safe areas `env(safe-area-inset-*)`, head/dock sobre teclado iOS, alto contraste, prefers-reduced-motion, `window.scrollWidth > clientWidth`, text overflow, tabelas ADM, modais com conteúdo longo e estados offline, 401,403,404,409,429,500. Não inventar prova visual.

## 3. BACKLOG DA UI QUE NÃO FOI DECLARADO CORRIGIDO

- [ ] UI-B01. Playwright/Browser real de todas telas e estados (BLOCKED por G1).
- [ ] UI-B02. Auditoria completa de contraste WCAG 2.2 AA, light/dark, placeholders, ícones e alertas; correções guiadas por screenshots (NOT RUN).
- [ ] UI-B03. Testes de teclado + leitor de tela real (NVDA/VoiceOver), com modais empilhados (NOT RUN).
- [ ] UI-B04. `SystemAdminView.tsx`: auditar identidade visual no modo claro; possui classes escuras fixas — pode demandar refatoração local após build. NÃO aplicar override global cego (NOT RUN).
- [ ] UI-B05. `useMessages.ts`: verificar descarte de Object URLs em anexo malsucedido/retry, sem revogar antes da confirmação e sem quebrar preview (NOT RUN).
- [ ] UI-B06. Paginação e scroll ao falhar `loadPreviousMessages`; eventual timeout/debounce de erros em rede instável (NOT RUN).
- [ ] UI-B07. Verificar upload, duração e MIME de áudios nos navegadores Safari/Chrome/Firefox reais (NOT RUN).
- [ ] UI-B08. QA de autorização UI para ADM e workspace em todos estados sem expor dados por engano (NOT RUN).
- [ ] UI-B09. Testes cross-tenant/cross-instance em staging para API, Supabase RLS e eventos, inclusive troca workspace ativa (BLOCKED).
- [ ] UI-B10. Fluxos Resend, Evolution, Newsletter, Groq E2E (BLOCKED).
- [ ] UI-B11. Lighthouse / Web Vitals com build de staging, bundle budgets e foco virtualizado se listas extensas (BLOCKED).
- [ ] UI-B12. Mensagens de erro do backend e retry com idempotência: não reenvie cegamente com status incerto (BLOCKED).

## 4. ORDEM DE EXECUÇÃO DO CODEX SEM RETRABALHO

### G0 — Backup e identificação da fonte
- [ ] Confirmar ZIP F16 + manifesto de hashes e commits; proteger branch de produção.
- [ ] Ler AGENTS + duas skills + doc F16; registrar versão Node/npm/OS + data.
- [ ] Conferir ENV schema e staging ref sem revelar tokens.

### G1 — Dependências e compilação (P0, bloqueador)
- [ ] Resolver divergências lockfile com npm oficial e acesso de rede.
- [ ] `npm ci --include=dev --include=optional`; guardar log e `npm ls --depth=0`.
- [ ] `npm test` (esperado 233 ou mais); corrigir falhas de código sem apagar testes.
- [ ] `npm run audit:release` PASS, com 0 divergências de lock.
- [ ] `npm run lint` PASS; NÃO desativar rules.
- [ ] `npx --no-install tsc --noEmit` PASS; NÃO adicionar `any` para esconder erros.
- [ ] `npm run build` PASS; árvore gerada e adapters verificados.
- [ ] `npm run build:gated` PASS com env de staging, nunca prod.

### G2 — Banco e segurança (P0, staging exclusivo)
- [ ] Revisar e reconciliar migrações divergentes SEM `db reset` ou `db push` em produção.
- [ ] Ler `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`; auditar `UNIQUE (workspace_id, external_id)` x `instance_id` e RPC.
- [ ] Validar RLS por workspace + instância, ausência de BOLA, proteção de owners/superadmin.
- [ ] Tratar concorrência, idempotência e recuperações com dados sintéticos e rollback.

### G3 — Backend e workers (P0)
- [ ] Verificar regras de webhooks, assinaturas, origem, dedupe, queues, deadletters, retries.
- [ ] Confirmar que erros de persistência realmente falham, evitando ack falso.
- [ ] Realizar contratos HTTP e testes com duas instâncias independentes.

### G4 — Integrações reais em staging (P0)
- [ ] Evolution E01–E22 em duas contas AUTORIZADAS, webhook staging e resposta automática desligada.
- [ ] Resend: OTP, recuperação, convites, alertas, newsletter opt-in/descadastro.
- [ ] Groq: controles de agentes, duplicidade, timeouts e trilha auditável.

### G5 — UI/UX QA + Deploy Preview (P0/P1)
- [ ] Rodar matriz de viewports, navegação keyboard, overlay/dialog, ambos os temas, rede lenta/offline.
- [ ] Corrigir UI reproduzível sem mexer em endpoint por conveniência.
- [ ] Capturar screenshots e logs console/network, erros de hydration, Web Vitals.

### G6 — Release controlado (P0)
- [ ] Todos P0 PASS, todos os demais registrados; nenhum alerta de segurança crítico.
- [ ] Checklist rollback, backups, observabilidade, health e resposta a incidentes.
- [ ] Aprovação específica do usuário antes de deploy real, SQL mutante ou reprocessamento.

## 5. POLÍTICA DE RISCO POR ALTERAÇÃO

Para TODA mudança futura, preencher: ID, sintoma, reprodução, causa raiz, arquivos, expectativa antes/depois, efeito em 2 tenants e 2 instâncias, risco de regressão, teste que falhou ANTES, teste que passou DEPOIS, testes impactados, screenshot/console/log, rollback e status. Sem evidência: NOT RUN/BLOCKED, nunca PASS.

No frontend preservar assinatura de endpoints e tipos, `clientMessageId`, `externalId`, `workspace_id`, `instance_id`, media lifetime e optimistic updates. No backend proteger auth, tokens server-only e billing OFF.

## 6. PROMPTS PARA O ANTIGRAVITY

# PROMPT POSITIVO — INBOXOS F16 / ANTIGRAVITY + CODEX
Você assumirá o InboxOS F16 EXISTENTE. Trabalhe em branch isolada; a raiz contém package.json e AGENTS.md. Leia integralmente ANTIGRAVITY_INICIO_FASE16.md e docs/FASE16_MASTER_HANDOFF_ANTIGRAVITY_CODEX.md; carregue as skills locais inboxos-premium-uiux e inboxos-backend-release. Preserve o design Trax, todos os fluxos, Supabase multi-tenant, Evolution V2, Resend, Groq e Billing OFF. Primeiro reproduza e resolva G1 corretamente: versões Node/npm, pacote e lock oficial, npm ci, lint, tsc e build, sem alterar testes/gates para aprovar artificialmente. Então execute QA visual por viewport e estado, corrigindo apenas problemas reproduzíveis e mantendo a proteção de mensagens entre chats da F16. Em seguida audite Supabase, schema/constraints/RPC e Evolution com dois workspaces e duas instâncias exclusivamente em staging verificado. Para cada mudança: causa raiz, arquivos, diff, risco, teste anterior, teste de regressão, status PASS/FAIL/BLOCKED/NOT RUN e evidência. Faça commits pequenos; antes de deploy real, solicite autorização específica com relatório do preview. Não confunda 233 testes Node com build/QA visual. Entregue patch/PR, evidências e checklist final.

# PROMPT NEGATIVO — NUNCA FAÇA
NÃO reescrever o app, substituir stack, recriar telas, mudar identidade visual, trocar componentes Phosphor por outras bibliotecas, injetar neon, remover glassmorphism, inventar endpoints, duplicar estado de chat, misturar mensagens entre chats, apagar fallback de imagem, perder recuperação de erro ou quebrar os atalhos de teclado. NÃO usar produção para staging, resetar Supabase, alterar migrações no banco vivo, diminuir RLS, desativar validações de workspace/instância, liberar service role para frontend, exibir segredos, enviar mensagens reais ou reprocessar backlog sem autorização expressa. NÃO alterar package-lock manualmente para simular npm ci, remover dependências às cegas, pular build, ocultar falhas, marcar teste não executado como PASS, inventar screenshots ou afirmar que UI está 100% pronta sem browser real. NÃO reaplicar patches das fases anteriores sobre F16.

## 7. COMANDOS EXECUTADOS NO AMBIENTE LOCAL

```bash
node --version # v22.16.0
npm test
npm run audit:release
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run lint
tsc --noEmit
npm run build
```

Saídas verificadas: 233/233 PASS; audit PASS parse/imports/rotas e FAIL lockfile (6); `npm ci` ENOTCACHED @netlify/vite-plugin-tanstack-start; `eslint`/`vite` não encontrados; TS2688 (vite/client). **Não foi executado um build real nesta sessão.**

