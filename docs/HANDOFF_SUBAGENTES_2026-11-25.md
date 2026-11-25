# InboxOS — Handoff para sub-agentes (2026-11-25)

Documento autossuficiente para outra conta/modelo continuar o trabalho. **Não contém segredos.**
Repositório: `https://github.com/Hylanderry/InboxOS` · branch `main` · último commit desta sessão: `b4a38b1`.

> `CLAUDE.md`, `.agents/` e `.claude/` estão no `.gitignore` e **não vêm no clone**. As regras que
> importam estão copiadas na seção 2. Leia-a antes de qualquer ação.

---

## 1. O que é o projeto

Painel multi-tenant de atendimento/vendas por WhatsApp. Stack: TanStack Start + Vite 8 + React 19
(Tailwind v4, shadcn, ícones Phosphor), Supabase (Postgres + RLS + Realtime), Evolution API v2,
Groq, Resend. Deploy na Vercel (projeto `inbox_os`). Conteúdo da UI em português do Brasil.

Comandos: `npm ci` · `npm run dev` · `npm test` (Node `--test`, **deve ficar 100% verde**) ·
`npx tsc --noEmit` · `npm run build` · `npm run lint`.

Estrutura: `src/routes` (páginas e `/api/*`), `src/features` (inbox, CRM, calendário, instâncias),
`src/server` (código server-only), `src/integrations/supabase`, `supabase/migrations`, `tests`, `docs`.

## 2. Regras inegociáveis (copiadas do CLAUDE.md e das regras do projeto)

**Ambientes**
- `.env` local **hoje aponta para o Supabase de PRODUÇÃO** (`bopdgnmifuohuoftjexs`). Isso contraria a regra
  (deveria ser staging). **Não faça login nem teste fluxos autenticados com esse `.env`**: a service role ignora
  RLS e o watchdog pode reescrever o webhook da Evolution compartilhada.
- `.env.production.local` = valores reais de produção; não usar em dev/testes. Nunca commitar `.env*`
  (exceto `.env.example`).

**Banco**
- Nunca usar o ref de produção como homologação. **Nenhum DDL/DML em produção sem autorização explícita do
  dono e plano de rollback.** Diagnóstico = `SELECT` de catálogo/contagens, sem extrair telefones, mensagens ou e-mails.
- Manter RLS em todos os tenants; `service_role` só no servidor; `user_metadata` não serve para autorização;
  revisar funções `SECURITY DEFINER` e `EXECUTE`.
- Confirmar constraints reais antes de qualquer `onConflict` (ex.: `whatsapp_contacts` →
  `workspace_id,instance_id,remote_jid`; `whatsapp_presence` → `workspace_id,instance_id,phone`).
- Não reprocessar eventos mortos da Evolution (~38,6k na fila, ~8,3k dead-letter) sem correção publicada,
  diagnóstico e canário autorizado.

**Evolution**
- Nenhuma mensagem real sem número/instância próprios e autorização; nunca cliente real.
- Webhook 2xx só confirma recebimento, não conclusão. Eventos deduplicados por chave que preserve
  `DELIVERED`/`READ`; nunca regredir estado; editar/apagar/reagir sempre escopado por `workspace_id`+`instance_id`.

**UI/UX**
- Seguir a identidade existente (neutros premium, vidro sutil, Phosphor, PT-BR). Sem nova família de ícones,
  sem biblioteca de UI nova, sem cores saturadas novas, sem `!important` global.
- Não alterar APIs/auth/RLS/billing por demanda puramente visual.
- Verificar larguras 320/360/390/768/1024/1440, claro e escuro, teclado, console e rede.
  **Não declarar "UI validada" sem screenshot real; se bloqueado, registrar `BLOCKED`. Não forjar evidência.**
- Menus: Escape + clique fora (nunca só `onMouseLeave`); modais com foco gerenciado; alvos de toque ≥ 44px.

**Fluxo de trabalho que o dono exige**
- Chamar as skills antes de trabalho de front/back: front → `inboxos-premium-uiux`, `frontend-design`,
  `vercel-react-best-practices`; back → `inboxos-backend-release`, `supabase`, `supabase-postgres-best-practices`.
- Commits pequenos, organizados, mensagem em inglês no formato `tipo(escopo): resumo`, push para `main`.
- Nunca commitar arquivos de outros projetos (apareceu um `PLANO_BOT_DOACAO_DISCORD.md` que é de outro projeto: ignorar).

## 3. Armadilhas aprendidas (economizam horas)

1. **`npm test` lista arquivos explicitamente** em `package.json` (`"test": "node --test tests/a.test.ts ..."`).
   Todo teste novo precisa ser adicionado nessa linha, senão não roda.
2. Os testes rodam com `node --experimental-strip-types`: **sem parameter properties** em classes e sem
   alias `@/` nos módulos testados (testes de lógica pura importam por caminho relativo `.ts`).
3. Checkouts Windows têm CRLF: testes com regex ancoradas em `\n` precisam normalizar (`replace(/\r\n/g, "\n")`).
4. `src/routeTree.gen.ts` é regerado pelo dev server e aparece como modificado. **Não commitar**:
   `git checkout src/routeTree.gen.ts`.
5. Ao editar arquivos por script, **`\n` dentro de string de código vira quebra real** e quebra a compilação
   (aconteceu duas vezes). Prefira a ferramenta de edição exata a scripts com escapes.
6. O CSS do **Sonner** é injetado depois do nosso CSS: seletores com a mesma especificidade perdem.
   Use `[data-sonner-toaster] [data-sonner-toast].inbox-toast ...`.
7. O navegador cacheia `/src/styles.css` em dev; para ver CSS novo, recarregue o `<link>` com `?t=`.
8. `vite build` exige o pacote `esbuild` (já adicionado como devDependency).
9. `npm audit` aponta 8 vulnerabilidades moderadas (não tratadas).
10. `npm run lint` retorna ~61 mil erros **só de fim de linha CRLF** (prettier). Falta `.gitattributes`/`endOfLine`.

---

## 4. O que já foi feito (todos em `origin/main`)

| Commit | Entrega |
|---|---|
| `a606420` | A1 — evita chats duplicados sob concorrência no `sync-engine` |
| `5619514` | A2 — cache de contatos particionado por workspace (`tenant-cache.ts`), com limite e `clearWorkspace` |
| `3654548` | A3 — `scopedAdmin(workspaceId)` + aviso de lint `no-unscoped-admin` (296 usos de `supabaseAdmin` ainda não migrados) |
| `44d0616` | B1 — ações da mensagem acessíveis em touch/teclado, long-press, Escape/clique fora |
| `0612e9c` | B2 — store único de presença (`presence-store.ts`); docs do incidente + scripts SQL |
| `ff1e958` | Sprint 0 / I1, I5, I6 — endurece envio e mídia, `useInstances` reage à troca de workspace, migration `20261125120000` (**não aplicada**) |
| `72a5eb9` | Sprint 0 / I4 — token de webhook **por instância** (HMAC) + replay da fila validando `workspace_id`/`instance_id` |
| `e780993` | A5 — bucket de rate limit separado para endpoints críticos (40/min) + headers 429 |
| `895da5a`, `3f30072`, `20a21e9` | ADM — foco dos inputs corrigido, guard obrigatório testado, System Admin por e-mail, integrações por campos e catálogo de modelos salvável |
| `87f5e11`, `b4a38b1` | UI — skeleton de loading no plano; redesenho de toasts/alertas (neutro, cor só no ícone) |
| `c070c7e`, `0a7211e`, `2110b91`, `31d35a2`, `54cb3d2`, `7758b20` | Limpeza (n8n, artefatos e2e, rastros de IA), build com `esbuild`, README reorganizado, suíte 100% verde |

Estado de qualidade no último commit: `tsc` OK · `npm run build` OK · **491/491 testes** · nada aplicado em banco algum.

Documentos de referência: `docs/PLANO_IMPLEMENTACAO_INBOXOS.md` (plano mestre, Sprint 0–5),
`docs/PLANO_ISOLAMENTO_INSTANCIAS.md` (incidente), `docs/sql/` (diagnóstico, contenção, rollback),
`docs/BACKLOG_AJUSTES_2026-11-17.md` (backlog), `docs/FASE16_MASTER_HANDOFF_ANTIGRAVITY_CODEX.md` (histórico).

## 5. Incidente P0 (isolamento de instâncias) — situação

Um cliente criou conta nova e viu a instância/WhatsApp pessoal do dono. **Causa provável (não confirmada no banco):**
a migration `20260915120000` e o trigger `bootstrap_first_workspace_owner` colocaram toda conta nova como membro do
workspace padrão `00000000-0000-0000-0000-000000000001`. O reparo `20261017090000` pode não ter sido aplicado e só apaga `role='agent'`.

**Bloqueado, depende do dono:**
1. Rodar `docs/sql/01_diagnostico_readonly.sql` no SQL Editor de produção e informar os números
   (o conector Supabase MCP foi **negado por falta de permissão** nesta conta; não contornar com a service role do `.env`).
2. Autorizar e rodar `docs/sql/02_contencao_producao.sql` (transação, com backup e rollback em `03_...`), com os UUIDs legítimos em `v_keep`.
3. Criar **Supabase de staging + Evolution sandbox** (pré-requisito de todo teste autenticado e de I2/I7).
4. Depois de todas as instâncias migrarem para o token por instância, definir `EVOLUTION_WEBHOOK_LEGACY_TOKEN=deny` na Vercel.
5. Avaliar obrigação de comunicação de incidente (LGPD).

---

## 6. O que falta (priorizado) e como dividir em sub-agentes

Regra de paralelismo: **dois sub-agentes nunca editam os mesmos arquivos.** Os cartões abaixo foram agrupados por arquivo.

### Cartão A — Isolamento no banco (I2, I3, I7) — *bloqueado por staging*
- **Objetivo:** RLS por membership em `whatsapp_instances`, `whatsapp_contacts`, `whatsapp_presence`, `chats`, `messages`, `evolution_events`
  (`USING` + `WITH CHECK`); nome da instância com prefixo do workspace gerado no servidor; criação de instância sem corrida check-then-insert
  (`src/routes/api/instances/index.ts:195-216`); job diário de auditoria read-only; `persist_inbox_message` buscar chat por `instance_id`.
- **Arquivos:** `supabase/migrations/*`, `src/routes/api/instances/index.ts`, `src/server/evolution/*`.
- **Aceite:** testes T1–T9 de `docs/PLANO_ISOLAMENTO_INSTANCIAS.md` (2+ workspaces) em staging. **Nunca aplicar em produção.**
- **Skills:** `inboxos-backend-release`, `supabase`, `supabase-postgres-best-practices`.

### Cartão B — Watchdog da Evolution (resto do I4)
- **Objetivo:** o GET `/api/instances` reescreve o webhook; impedir que reescreva instância que não pertence ao ambiente atual
  (preview/dev "rouba" o webhook da produção). Ligar a guarda a `assertEvolutionWebhookConfigurationAllowed`.
- **Arquivos:** `src/lib/evolution.server.ts`, `src/routes/api/instances/index.ts`, `src/server/evolution/webhook-config.ts`.

### Cartão C — Chat Sprint 1/4 (B3, B4, B5–B8)
- B3 preservar rascunho do composer entre chats; B4 busca global acessível em mobile/tablet; B5 auto-select agressivo de chat;
  B6 focus trap no dropdown do `ChatHeader`; B7 `aria-live` no typing; B8 estado offline visível.
- **Arquivos:** `src/features/inbox/components/{Composer*,ChatHeader,InboxShell,ConversationList*}.tsx`, `src/features/inbox/hooks/*`.
- **Aceite:** teste de contrato + screenshots reais (6 larguras, 2 temas) — **exige staging/login**; sem isso, marcar `BLOCKED`.

### Cartão D — Unslop visual (base) — backlog P1
- Trocar tokens slate/azulados do shadcn por neutros Trax (`styles.css:64-133`); escala tipográfica fixa (11/12/13/15/20, eliminar ~125 usos de 9–10px);
  Phosphor com 3 tamanhos e 1 peso; uma família de cinza (hoje neutral ×497, zinc ×221, 233 hex soltos); verde `#00a884` só quando semântico (×54 hoje);
  regra de raio; tema via `dark:`/tokens em vez de `isDarkMode` com ternários; enxugar `styles.css` (3.2k linhas, 56 `!important`).
- **Arquivos:** `src/styles.css`, `src/components/ui/*`, `src/features/**` (tarefa ampla → **fatiar por tela** e rodar em série).
- **Já feito neste eixo:** toasts/alertas (`--feedback-*`). Usar o mesmo padrão de tokens.

### Cartão E — Unslop interno (código)
- Remover código morto (`FeaturePlaceholder.tsx` — hoje referenciado por `tests/uiux-phase16.test.ts`; ajustar o teste com cuidado, nunca apagar teste para passar),
  `FeaturePlaceholder`, comentários genéricos, abstrações repetidas, `card()/inputClass()` recriados por tela → primitivos shadcn;
  migrar `supabaseAdmin` → `scopedAdmin` onde houver `workspace_id` (um módulo por vez, com teste).
- Corrigir lint: adicionar `.gitattributes` (`* text=auto eol=lf`) ou `endOfLine: "auto"` no `.prettierrc`; tratar os 6 warnings de `react-refresh`; avaliar `npm audit`.

### Cartão F — ADM (restante do backlog P1)
- Tabelas reais (usuários, workspaces, auditoria) com busca server-side, paginação e drawer; estado por aba (hoje um `data` compartilhado);
  auditoria com filtros (ação, alvo, período) e rótulos legíveis; modo claro do ADM; cabeçalho duplicado (`routes/admin.tsx` + `SystemAdminView`).
- **Arquivos:** `src/features/inbox/components/SystemAdminView.tsx` (1,6k linhas → extrair por aba), `src/server/admin/*`.
- **Contratos que não podem quebrar:** `tests/admin-guardrails.test.ts` (guard `requireSystemAdmin` em todo handler; `Field`/`Box` fora do componente).

### Cartão G — Sprints 2, 3 e 5 do plano mestre
- Sprint 2: dashboard com gráficos e filtros de período, métricas de qualidade, insights em "Precisa de atenção".
- Sprint 3: feedback 👍/👎 nos agentes IA, timeline unificada e perfil rico do cliente, follow-ups sugeridos, lembretes de agendamento por WhatsApp.
- Sprint 4 restante: A4 batch no CRM, D2 importação com dedup, D3 histórico do lead, G2/G3 calendário.
- Sprint 5: B9–B14, A6–A13, E2–E4, F3–F4, G4–G6, H1–H6 (ver tabela no plano).
- **Cuidado:** billing está desativado (`ENABLE_BILLING=false`) e não existe provedor de pagamento. Mexer só no visual; **não reativar billing nem criar checkout**.

### Cartão H — Higiene do repositório
- Avaliar arquivar handoffs antigos em `docs/` (98 arquivos; vários são citados por regras/skills — não apagar sem checar); `vercel.preview.json` sem referências;
  `public/logo.png` e `logo-dark-mode.png` com o mesmo tamanho (possível duplicata); atualizar `recharts 2→3` e `eslint 9`.

---

## 7. Ferramentas e conexões que o modelo (gateway) precisa

Esta sessão tinha, além de shell/arquivos/git, estas capacidades. Um modelo via gateway **pode não ter nenhuma delas**.
Peça a ele que **instale/abra** cada uma e **devolva o status**; quem autoriza OAuth e cola tokens é o dono.

| Capacidade | Para quê | Como conectar | Observação de segurança |
|---|---|---|---|
| Shell + git + `gh` | rodar testes, commits, push | `gh auth login` (ou token) | token com escopo só deste repositório |
| **Supabase MCP** | consultas read-only, advisors, migrations em **staging** | URL `https://mcp.supabase.com/mcp` (OAuth 2.1) ou token pessoal **com escopo** | **negado nesta conta**. Usar só projeto de staging; produção apenas `SELECT` de catálogo, com autorização |
| **Vercel MCP** | logs de runtime, deployments, variáveis, rollback | MCP oficial da Vercel (OAuth) | não imprimir valores de variáveis |
| Navegador (Playwright MCP ou Chrome/in-app browser) | screenshots 320–1440, console, rede, teclado | instalar o MCP de automação de navegador | usar só em dev/staging; **nunca logar na produção** |
| Preview/dev server | `npm run dev` na porta 3000 (`.claude/launch.json` local) | criar a config local; **não versionada** | `.env` ainda aponta para produção |
| Evolution API | testes de instância/webhook | HTTP; **não há MCP** | só instância sandbox e número próprio |

### Prompt para colar no modelo gateway (instalação das ferramentas)

```text
Você vai trabalhar no repositório InboxOS (https://github.com/Hylanderry/InboxOS). Antes de qualquer tarefa:

1. Liste as ferramentas/MCPs que você tem hoje (nome e o que cada uma faz).
2. Instale e deixe ativos estes servidores MCP, se o seu ambiente permitir: Supabase, Vercel,
   GitHub (ou gh CLI autenticado) e automação de navegador (Playwright ou equivalente).
   Para os remotos com OAuth, abra o fluxo de conexão e me mostre o link/código para eu autorizar.
   NÃO peça nem cole senhas, chaves ou tokens no chat; eu os informo direto no fluxo de autorização.
3. Abra uma conexão que me permita vincular suas ferramentas ao Claude (por exemplo, expor um servidor MCP
   remoto/HTTP ou um endpoint de ferramentas) e me diga exatamente o que instalar/vincular do meu lado.
4. Confirme com um teste inofensivo de cada ferramenta (ex.: `gh repo view`, listar projetos Supabase,
   listar deployments da Vercel, abrir uma página pública no navegador) e responda em uma tabela:
   ferramenta | conectada? | permissões | limitações.
5. Só depois leia docs/HANDOFF_SUBAGENTES_2026-11-25.md e aguarde minha escolha do cartão (A–H).
Regras: nunca aplicar nada em banco de produção; nunca usar o .env local para logar; respeitar a seção 2 do handoff.
```

> Observação: não consigo daqui instalar nem vincular as ferramentas de outra conta — isso depende do ambiente do gateway
> e das autorizações do dono. O prompt acima faz o gateway preparar tudo e te devolver o que você precisa vincular.

## 8. Prompt-base para cada sub-agente

```text
Contexto: leia docs/HANDOFF_SUBAGENTES_2026-11-25.md (seções 2 e 3) e o cartão <LETRA> da seção 6.
Tarefa: <objetivo do cartão>. Arquivos permitidos: <lista do cartão>; não toque em nenhum outro.
Antes de editar: invoque as skills indicadas no cartão e leia os arquivos-alvo.
Entrega: mudança mínima + teste (adicione-o à linha "test" do package.json), depois rode
`npx tsc --noEmit`, `npm test` e `npm run build`. Faça um commit pequeno (`tipo(escopo): resumo`)
e NÃO faça push sem eu pedir. Relate: ID | problema | causa | arquivos | correção | risco | teste | evidência | PASS/FAIL/BLOCKED | rollback.
Nunca: aplicar SQL em produção, logar com o .env local, enviar mensagem real, forjar evidência, commitar .env.
```

## 9. Ordem sugerida

1. Dono: diagnóstico SQL + staging (desbloqueia A, C verificado, D com screenshots).
2. Em paralelo, sem staging: **B** (watchdog), **E** (limpeza/lint) e **F** (ADM) — arquivos disjuntos.
3. Depois: **D** (unslop visual por tela), **C**, **G** em série.
4. Fechamento: remover o fallback legado do token de webhook, atualizar este documento e o plano mestre.
