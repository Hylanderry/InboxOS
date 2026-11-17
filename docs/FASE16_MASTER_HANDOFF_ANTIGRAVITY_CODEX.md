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

## 8. DIFERENCIAL EXATO DE CÓDIGO F15 → F16

```diff
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts tests/uiux-phase14.test.ts tests/uiux-phase15.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts tests/uiux-phase14.test.ts tests/uiux-phase15.test.ts tests/uiux-phase16.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
--- a/src/features/inbox/components/AccountsSidebar.tsx
+++ b/src/features/inbox/components/AccountsSidebar.tsx
@@ -1,6 +1,7 @@
 import { useState } from "react";
 import { PushPin, Plus, SquaresFour, ArrowsClockwise } from "@phosphor-icons/react";
 import type { WhatsAppInstance } from "../types";
+import { WhatsAppToast } from "@/components/ui/ToastProvider";
 
 interface AccountsSidebarProps {
   instances: WhatsAppInstance[];
@@ -33,6 +34,8 @@
     setIsSyncing(true);
     try {
       await onSync();
+    } catch {
+      WhatsAppToast.networkError("Não foi possível sincronizar as contas. Tente novamente.");
     } finally {
       setIsSyncing(false);
     }
@@ -83,6 +86,7 @@
                       : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200/70"
                   }`}
                   title="Sincronizar Mensagens com WhatsApp"
+                  aria-label="Sincronizar mensagens com WhatsApp"
                 >
                   <ArrowsClockwise
                     size={15}
@@ -102,6 +106,8 @@
                       : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200/70"
                 }`}
                 title={isPinned ? "Desafixar Barra" : "Fixar Barra Expandida"}
+                aria-label={isPinned ? "Desafixar barra de contas" : "Fixar barra de contas expandida"}
+                aria-pressed={isPinned}
               >
                 <PushPin size={15} weight={isPinned ? "fill" : "regular"} />
               </button>
@@ -115,6 +121,7 @@
                     : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70"
                 }`}
                 title="Conectar Nova Conta de WhatsApp"
+                aria-label="Conectar nova conta de WhatsApp"
               >
                 <Plus size={16} weight="bold" />
               </button>
--- a/src/features/inbox/components/BusinessProfileModal.tsx
+++ b/src/features/inbox/components/BusinessProfileModal.tsx
@@ -1,4 +1,4 @@
-import { useState, useEffect } from "react";
+import { useState, useEffect, useRef } from "react";
 import {
   X,
   Buildings,
@@ -65,6 +65,10 @@
   const [loading, setLoading] = useState(true);
   const [profile, setProfile] = useState<BusinessProfileData | null>(null);
   const [error, setError] = useState<string | null>(null);
+  const dialogRef = useRef<HTMLDivElement | null>(null);
+  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
+  const onCloseRef = useRef(onClose);
+  onCloseRef.current = onClose;
 
   const cleanName = stripEmojis(contactName) || "Contato";
   const cleanInitials =
@@ -111,12 +115,35 @@
 
   useEffect(() => {
     if (!isOpen) return;
+    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+    closeButtonRef.current?.focus();
     const handleKeyDown = (event: KeyboardEvent) => {
-      if (event.key === "Escape") onClose();
+      if (event.key === "Escape") {
+        event.preventDefault();
+        onCloseRef.current();
+        return;
+      }
+      if (event.key !== "Tab") return;
+      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
+        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
+      ) ?? []);
+      if (!controls.length) return;
+      const first = controls[0]!;
+      const last = controls[controls.length - 1]!;
+      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        last.focus();
+      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        first.focus();
+      }
     };
     document.addEventListener("keydown", handleKeyDown);
-    return () => document.removeEventListener("keydown", handleKeyDown);
-  }, [isOpen, onClose]);
+    return () => {
+      document.removeEventListener("keydown", handleKeyDown);
+      if (previousFocus?.isConnected) previousFocus.focus();
+    };
+  }, [isOpen]);
 
   if (!isOpen) return null;
 
@@ -127,6 +154,8 @@
       role="presentation"
     >
       <div
+        ref={dialogRef}
+        aria-labelledby="business-profile-title"
         className={`w-full max-w-lg m-auto rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all animate-scale-in ${
           isDarkMode
             ? "bg-[#111115] border-white/[0.12] text-neutral-100 shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
@@ -144,12 +173,14 @@
         >
           <div className="flex items-center gap-2">
             <Buildings size={20} className="text-[#25d366]" weight="bold" />
-            <h3 className="font-bold text-sm">Informações do Contato</h3>
+            <h3 id="business-profile-title" className="font-bold text-sm">Informações do Contato</h3>
           </div>
           <button
             type="button"
+            ref={closeButtonRef}
             onClick={onClose}
-            className={`p-1.5 rounded-lg transition-colors ${
+            aria-label="Fechar informações do contato"
+            className={`min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-colors ${
               isDarkMode
                 ? "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                 : "hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900"
--- a/src/features/inbox/components/ChatHeader.tsx
+++ b/src/features/inbox/components/ChatHeader.tsx
@@ -1,4 +1,4 @@
-import { useState, lazy, Suspense } from "react";
+import { useState, useEffect, useRef, lazy, Suspense } from "react";
 import {
   ArrowLeft,
   PushPin,
@@ -43,6 +43,30 @@
   const [isMenuOpen, setIsMenuOpen] = useState(false);
   const [imgFailed, setImgFailed] = useState(false);
   const [isProfileOpen, setIsProfileOpen] = useState(false);
+  const menuRef = useRef<HTMLDivElement | null>(null);
+  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
+  // Estado de erro de imagem precisa acompanhar mudanças de foto no mesmo chat.
+  useEffect(() => setImgFailed(false), [conversation.avatar]);
+  useEffect(() => {
+    if (!isMenuOpen) return;
+    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
+    const dismissOutside = (event: PointerEvent) => {
+      if (menuRef.current?.contains(event.target as Node) || menuTriggerRef.current?.contains(event.target as Node)) return;
+      setIsMenuOpen(false);
+    };
+    const dismissEscape = (event: KeyboardEvent) => {
+      if (event.key !== "Escape") return;
+      event.preventDefault();
+      setIsMenuOpen(false);
+      menuTriggerRef.current?.focus();
+    };
+    document.addEventListener("pointerdown", dismissOutside);
+    document.addEventListener("keydown", dismissEscape);
+    return () => {
+      document.removeEventListener("pointerdown", dismissOutside);
+      document.removeEventListener("keydown", dismissEscape);
+    };
+  }, [isMenuOpen]);
 
   const { isTyping, isRecording } = usePresence();
   const typing = isTyping(conversation.phone);
@@ -234,7 +258,10 @@
           <div className="relative">
             <button
               type="button"
+              ref={menuTriggerRef}
               onClick={() => setIsMenuOpen(!isMenuOpen)}
+              aria-controls="chat-header-action-panel"
+              aria-haspopup="true"
               className={`chat-header-action p-2 rounded-lg transition-colors ${
                 isDarkMode
                   ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
@@ -249,12 +276,15 @@
 
             {isMenuOpen && (
               <div
+                id="chat-header-action-panel"
+                ref={menuRef}
+                role="group"
+                aria-label="Ações adicionais da conversa"
                 className={`absolute right-0 top-full mt-2 w-48 p-1.5 rounded-2xl border shadow-2xl z-50 animate-smooth-in ${
                   isDarkMode
                     ? "bg-[#181820] border-[#2a2a36] text-white shadow-black/80"
                     : "bg-white border-neutral-200 text-neutral-900"
                 }`}
-                onMouseLeave={() => setIsMenuOpen(false)}
               >
                 <button
                   type="button"
--- a/src/features/inbox/components/ConversationRow.tsx
+++ b/src/features/inbox/components/ConversationRow.tsx
@@ -1,4 +1,4 @@
-import { useState } from "react";
+import { useEffect, useState } from "react";
 import {
   PushPin,
   Microphone,
@@ -27,6 +27,7 @@
   isDarkMode = true,
 }: ConversationRowProps) {
   const [imgFailed, setImgFailed] = useState(false);
+  useEffect(() => setImgFailed(false), [conversation.avatar]);
   const { isTyping, isRecording } = usePresence();
   const typing = isTyping(conversation.phone);
   const recording = isRecording(conversation.phone);
@@ -62,6 +63,7 @@
     <button
       type="button"
       onClick={() => onSelect(conversation.id)}
+      aria-current={isSelected ? "true" : undefined}
       className={`w-full px-4 py-3 flex items-center justify-between gap-3.5 cursor-pointer select-none text-left transition-all duration-150 border-b relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500 ${
         isDarkMode ? "border-[#191922]" : "border-neutral-100"
       } ${
--- a/src/features/inbox/components/InboxShell.tsx
+++ b/src/features/inbox/components/InboxShell.tsx
@@ -1,4 +1,4 @@
-import { useState, useMemo, useEffect, lazy, Suspense } from "react";
+import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
 import type { ChatMessage } from "../types";
 import { useConversations } from "../hooks/useConversations";
 import { useMessages } from "../hooks/useMessages";
@@ -51,6 +51,18 @@
   const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
   const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
   const [isDarkMode, setIsDarkMode] = useState(true);
+  const [themeLoaded, setThemeLoaded] = useState(false);
+  // Preferência local do operador; a renderização inicial permanece estável no SSR.
+  useEffect(() => {
+    try {
+      const stored = window.localStorage.getItem("inboxos:theme");
+      if (stored === "dark" || stored === "light") setIsDarkMode(stored === "dark");
+    } catch {
+      // Navegação privada ou armazenamento bloqueado: manter o padrão.
+    } finally {
+      setThemeLoaded(true);
+    }
+  }, []);
   const [isRailOpen, setIsRailOpen] = useState(true);
   const [isQrModalOpen, setIsQrModalOpen] = useState(false);
   const [isImportExportOpen, setIsImportExportOpen] = useState(false);
@@ -91,6 +103,8 @@
     const found = conversations.find((c) => c.id === selectedChatId);
     return found || null;
   }, [conversations, selectedChatId, viewport.isDesktop]);
+  const activeChatIdRef = useRef<string | null>(activeChat?.id ?? null);
+  activeChatIdRef.current = activeChat?.id ?? null;
 
   const handleSelectChat = (id: string) => {
     setSelectedChatId(id);
@@ -102,8 +116,10 @@
   const {
     messages,
     isLoading: isLoadingMessages,
+    error: messagesError,
     hasMore: hasMoreMessages,
     loadPreviousMessages,
+    refetch: refetchMessages,
     sendMessage,
     sendPresence,
   } = useMessages(
@@ -142,7 +158,14 @@
     } else {
       root.classList.remove("dark");
     }
-  }, [isDarkMode]);
+    // Não sobrescrever a preferência antes de lê-la (inclusive em StrictMode).
+    if (!themeLoaded) return;
+    try {
+      window.localStorage.setItem("inboxos:theme", isDarkMode ? "dark" : "light");
+    } catch {
+      // O tema funciona em memória mesmo com armazenamento indisponível.
+    }
+  }, [isDarkMode, themeLoaded]);
 
   const currentViewMeta = getAppViewMeta(currentView);
   const composition = resolveInboxComposition({ isDesktop: viewport.isDesktop, currentView, hasActiveChat: Boolean(activeChat) });
@@ -368,6 +391,8 @@
                 <MessageTimeline
                   messages={messages}
                   isLoading={isLoadingMessages}
+                  error={messagesError}
+                  onRetry={() => void refetchMessages()}
                   hasMore={hasMoreMessages}
                   onLoadPrevious={loadPreviousMessages}
                   onPreviewMedia={setPreviewMedia}
@@ -384,7 +409,11 @@
                   onSendMessage={sendMessage}
                   onPresence={sendPresence}
                   replyingTo={replyingTo}
-                  onCancelReply={() => setReplyingTo(null)}
+                  onCancelReply={() => {
+                    // Um envio do chat anterior pode concluir depois da troca de conversa.
+                    // Não apagar a citação que o usuário já escolheu no chat atual.
+                    if (activeChatIdRef.current === activeChat.id) setReplyingTo(null);
+                  }}
                   isDarkMode={isDarkMode}
                   isGroup={activeChat.isGroup}
                   canSend={activeChat.canSend}
--- a/src/features/inbox/components/MessageComposer.tsx
+++ b/src/features/inbox/components/MessageComposer.tsx
@@ -64,6 +64,7 @@
   const fileInputRef = useRef<HTMLInputElement | null>(null);
   const docInputRef = useRef<HTMLInputElement | null>(null);
   const attachMenuRef = useRef<HTMLDivElement | null>(null);
+  const attachTriggerRef = useRef<HTMLButtonElement | null>(null);
   const inputRef = useRef<HTMLTextAreaElement | null>(null);
   // O ref impede envios simultâneos até antes da próxima renderização do React.
   const sendInFlightRef = useRef(false);
@@ -88,8 +89,13 @@
   // O menu também fecha via Escape, sem afetar o editor ou as mensagens.
   useEffect(() => {
     if (!isAttachOpen) return;
+    attachMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
     const onEscape = (event: KeyboardEvent) => {
-      if (event.key === "Escape") setIsAttachOpen(false);
+      if (event.key === "Escape") {
+        event.preventDefault();
+        setIsAttachOpen(false);
+        attachTriggerRef.current?.focus();
+      }
     };
     document.addEventListener("keydown", onEscape);
     return () => document.removeEventListener("keydown", onEscape);
@@ -298,7 +304,7 @@
               <div className="flex items-center gap-2.5 min-w-0 pl-2 border-l-2 border-zinc-500">
                 <ArrowBendUpLeft size={15} className="text-zinc-400 shrink-0" weight="bold" />
                 <div className="min-w-0">
-                  <span className="font-semibold text-zinc-300 text-[11.5px] block truncate">
+                  <span className={`font-semibold text-[12px] block truncate ${isDarkMode ? "text-zinc-200" : "text-neutral-800"}`}>
                     Respondendo a ~ {cleanReplyingSender || "Você"}
                   </span>
                   <span className="text-neutral-400 text-[11px] block truncate">
@@ -317,7 +323,7 @@
               <button
                 type="button"
                 onClick={onCancelReply}
-                className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors ml-2 shrink-0 hover:bg-white/10"
+                className={`min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg transition-colors ml-2 shrink-0 ${isDarkMode ? "text-neutral-400 hover:text-white hover:bg-white/10" : "text-neutral-600 hover:text-neutral-950 hover:bg-black/5"}`}
                 title="Cancelar resposta"
                 aria-label="Cancelar resposta"
               >
@@ -426,6 +432,7 @@
               {/* Botão de Anexo */}
               <button
                 type="button"
+                ref={attachTriggerRef}
                 onClick={() => setIsAttachOpen(!isAttachOpen)}
                 disabled={isSending}
                 className={`p-2.5 rounded-lg transition-colors ${
--- a/src/features/inbox/components/MessageTimeline.tsx
+++ b/src/features/inbox/components/MessageTimeline.tsx
@@ -8,6 +8,8 @@
 interface MessageTimelineProps {
   messages: ChatMessage[];
   isLoading: boolean;
+  error?: string | null;
+  onRetry?: () => void;
   hasMore: boolean;
   onLoadPrevious: () => void;
   onPreviewMedia: (media: {
@@ -68,6 +70,8 @@
 export function MessageTimeline({
   messages,
   isLoading,
+  error = null,
+  onRetry,
   hasMore,
   onLoadPrevious,
   onPreviewMedia,
@@ -140,6 +144,16 @@
         isDarkMode ? "bg-[#0a0a0b]" : "bg-[#f2f2ef]"
       }`}
     >
+      {error && (
+        <div role="alert" className={`mx-auto mb-3 max-w-xl rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${isDarkMode ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
+          <span>Não foi possível atualizar as mensagens. Verifique a conexão e tente novamente.</span>
+          {onRetry && (
+            <button type="button" onClick={onRetry} disabled={isLoading} className="min-h-10 rounded-lg border border-current/25 px-3 font-semibold hover:bg-current/10 disabled:opacity-50">
+              Tentar novamente
+            </button>
+          )}
+        </div>
+      )}
       {/* Botão de carregar mensagens mais antigas */}
       {hasMore && (
         <div className="flex justify-center pb-2">
@@ -164,7 +178,7 @@
           <ArrowsClockwise size={32} className="animate-spin text-neutral-400 mb-3 opacity-80" />
           <p className="text-xs font-semibold text-neutral-400">Carregando conversa...</p>
         </div>
-      ) : messages.length === 0 ? (
+      ) : !error && messages.length === 0 ? (
         <div className="py-24 flex flex-col items-center justify-center text-center text-neutral-500 animate-smooth-in">
           <ChatCircleText size={44} className="mb-2.5 opacity-30" />
           <p className="text-sm font-medium">Nenhuma mensagem nesta conversa ainda</p>
--- a/src/features/inbox/components/SettingsView.tsx
+++ b/src/features/inbox/components/SettingsView.tsx
@@ -103,7 +103,7 @@
         <div className="min-w-0">
           <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">{eyebrow}</p>
           <h2 className="mt-1 text-sm font-semibold tracking-[-0.02em]">{title}</h2>
-          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{description}</p>
+          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
         </div>
       </div>
       {children}
@@ -128,7 +128,7 @@
 }) {
   return (
     <label className="grid min-w-0 gap-1.5">
-      <span className="text-[10px] font-semibold text-zinc-500">{label}</span>
+      <span className="text-xs font-semibold text-zinc-500">{label}</span>
       <input
         className="h-10 min-w-0 rounded-xl border border-current/10 bg-black/5 px-3 text-xs outline-none focus:border-current/25 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white/[0.03]"
         value={value}
@@ -160,7 +160,7 @@
       type={type}
       disabled={disabled}
       onClick={onClick}
-      className={`h-9 shrink-0 rounded-xl border px-3 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
+      className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
         danger
           ? "border-red-500/20 text-red-500 hover:bg-red-500/10"
           : "border-current/10 hover:bg-current/[0.04]"
--- /dev/null
+++ b/src/features/inbox/hooks/chat-scoped-update.ts
@@ -0,0 +1,16 @@
+/**
+ * Atualizações assíncronas não devem contaminar a conversa ativa quando o operador
+ * alterna para outro chat antes da conclusão de um envio / evento em tempo real.
+ * Função pura para permitir testes sem React e sem tocar no banco.
+ */
+export function applyChatScopedUpdate<T>(
+  activeChatId: string | null,
+  targetChatId: string,
+  visibleMessages: T[],
+  cachedTargetMessages: T[],
+  update: (messages: T[]) => T[],
+): { visible: T[]; target: T[] } {
+  const isActive = activeChatId === targetChatId;
+  const target = update(isActive ? visibleMessages : cachedTargetMessages);
+  return { visible: isActive ? target : visibleMessages, target };
+}
--- a/src/features/inbox/hooks/useMessages.ts
+++ b/src/features/inbox/hooks/useMessages.ts
@@ -5,6 +5,7 @@
 import { WhatsAppToast } from "@/components/ui/ToastProvider";
 import { apiFetch } from "@/lib/api-fetch";
 import { subscribeInboxEvent } from "@/lib/realtimeSocket";
+import { applyChatScopedUpdate } from "./chat-scoped-update";
 
 interface SendMessageInput {
   text?: string | undefined;
@@ -100,9 +101,18 @@
   const updateMessagesState = useCallback(
     (chat: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
       setMessages((prev) => {
-        const next = deduplicateMessages(updater(prev));
-        cacheMessages(chat, next);
-        return next;
+        // A resposta de uma requisição pode chegar após o operador trocar de chat.
+        // Atualizar somente o cache do chat antigo; nunca inserir suas mensagens
+        // na lista que o React está exibindo para outra conversa.
+        const { visible, target } = applyChatScopedUpdate(
+          activeChatIdRef.current,
+          chat,
+          prev,
+          messagesCache.get(chat) ?? [],
+          (base) => deduplicateMessages(updater(base)),
+        );
+        cacheMessages(chat, target);
+        return visible;
       });
     },
     [],
@@ -147,6 +157,9 @@
         if (activeChatIdRef.current !== chatId) return;
 
         const data = await res.json();
+        // Também valida após o parse assíncrono para não sobrescrever paginação
+        // nem loading com a resposta do chat que deixou de estar ativo.
+        if (controller.signal.aborted || activeChatIdRef.current !== chatId) return;
         const rawList = Array.isArray(data?.messages) ? data.messages : [];
         const mapped = rawList.map((m: any) => mapMessageDto(m));
 
--- a/src/features/media/components/MediaPreviewModal.tsx
+++ b/src/features/media/components/MediaPreviewModal.tsx
@@ -51,7 +51,7 @@
     <div
       className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto"
       ref={dialogRef}
-      onClick={onClose}
+      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
       role="dialog"
       aria-modal="true"
       aria-label={media.name ? `Pré-visualização de ${media.name}` : "Pré-visualização de mídia"}
--- a/src/styles.css
+++ b/src/styles.css
@@ -704,3 +704,20 @@
   .auth-page .auth-primary,
   .auth-page .auth-secondary { transform: none !important; transition: none !important; }
 }
+
+
+/* Fase 16 — affordances de interação, sem alterar o layout ou os endpoints. */
+.chat-header-action,
+.inbox-app .mobile-icon-button,
+.inbox-app .mobile-profile-button {
+  min-width: 44px;
+  min-height: 44px;
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+}
+.inbox-app .mobile-account-pill { min-height: 44px; }
+.inbox-app [role="alert"] { overflow-wrap: anywhere; }
+@media (max-width: 380px) {
+  .inbox-app .chat-header-action { min-width: 40px; min-height: 40px; }
+}
--- /dev/null
+++ b/tests/uiux-phase16.test.ts
@@ -0,0 +1,102 @@
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+import { applyChatScopedUpdate } from "../src/features/inbox/hooks/chat-scoped-update.ts";
+const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
+
+test("F16/UI01: atualização assíncrona do chat A não contamina mensagens visíveis do chat B", () => {
+  const visible = [{ id: "b-1" }];
+  const cacheA = [{ id: "a-1" }];
+  const result = applyChatScopedUpdate("B", "A", visible, cacheA, (list) => [...list, { id: "a-2" }]);
+  assert.deepEqual(result.visible, visible);
+  assert.strictEqual(result.visible, visible);
+  assert.deepEqual(result.target, [{ id: "a-1" }, { id: "a-2" }]);
+});
+
+test("F16/UI02: mensagens do chat ativo atualizam UI e cache com o mesmo resultado", () => {
+  const visible = [{ id: "a-1" }];
+  const result = applyChatScopedUpdate("A", "A", visible, [], (list) => [...list, { id: "a-2" }]);
+  assert.deepEqual(result.visible, [{ id: "a-1" }, { id: "a-2" }]);
+  assert.strictEqual(result.target, result.visible);
+});
+
+test("F16/UI03: callback de update não recebe lista do chat ativo quando alvo é outro", () => {
+  const result = applyChatScopedUpdate("B", "A", ["segredo-B"], ["mensagem-A"], (list) => {
+    assert.deepEqual(list, ["mensagem-A"]);
+    return [...list, "reconciliada-A"];
+  });
+  assert.deepEqual(result.visible, ["segredo-B"]);
+});
+
+test("F16/UI04: fetch descarta resultado após parse caso chat tenha mudado", () => {
+  const code = source("src/features/inbox/hooks/useMessages.ts");
+  assert.match(code, /const data = await res\.json\(\);[\s\S]*?controller\.signal\.aborted \|\| activeChatIdRef\.current !== chatId/);
+  assert.match(code, /applyChatScopedUpdate\(/);
+});
+
+test("F16/UI05: histórico possui erro explícito e ação de tentar novamente", () => {
+  const shell = source("src/features/inbox/components/InboxShell.tsx");
+  const timeline = source("src/features/inbox/components/MessageTimeline.tsx");
+  assert.match(shell, /error=\{messagesError\}/);
+  assert.match(shell, /onRetry=\{\(\) => void refetchMessages\(\)\}/);
+  assert.match(timeline, /role="alert"/);
+  assert.match(timeline, /Tentar novamente/);
+});
+
+test("F16/UI06: preferencia de tema armazenada de forma defensiva", () => {
+  const code = source("src/features/inbox/components/InboxShell.tsx");
+  assert.match(code, /localStorage\.getItem\("inboxos:theme"\)/);
+  assert.match(code, /localStorage\.setItem\("inboxos:theme"/);
+  assert.match(code, /if \(!themeLoaded\) return;/);
+});
+
+test("F16/UI07: menu do cabeçalho possui Escape, clique externo, foco e ARIA", () => {
+  const code = source("src/features/inbox/components/ChatHeader.tsx");
+  assert.match(code, /document\.addEventListener\("pointerdown", dismissOutside\)/);
+  assert.match(code, /document\.addEventListener\("keydown", dismissEscape\)/);
+  assert.match(code, /menuTriggerRef\.current\?\.focus\(\)/);
+  assert.match(code, /aria-expanded=\{isMenuOpen\}/);
+  assert.doesNotMatch(code, /onMouseLeave=\{\(\) => setIsMenuOpen\(false\)\}/);
+});
+
+test("F16/UI08: avatar revalida quando a URL muda", () => {
+  for (const file of ["ChatHeader.tsx", "ConversationRow.tsx"]) {
+    const code = source(`src/features/inbox/components/${file}`);
+    assert.match(code, /useEffect\(\(\) => setImgFailed\(false\), \[conversation\.avatar\]\)/);
+  }
+});
+
+test("F16/UI09: perfil comercial possui trap de teclado, rotulo e retorno de foco", () => {
+  const code = source("src/features/inbox/components/BusinessProfileModal.tsx");
+  assert.match(code, /aria-labelledby="business-profile-title"/);
+  assert.match(code, /event\.key !== "Tab"/);
+  assert.match(code, /previousFocus\?\.isConnected/);
+  assert.match(code, /aria-label="Fechar informações do contato"/);
+});
+
+test("F16/UI10: novo chat nao perde a resposta citada devido a envio antigo", () => {
+  const code = source("src/features/inbox/components/InboxShell.tsx");
+  assert.match(code, /if \(activeChatIdRef\.current === activeChat\.id\) setReplyingTo\(null\)/);
+});
+
+test("F16/UI11: sincronizacao manual e controles de contas possuem acessibilidade", () => {
+  const code = source("src/features/inbox/components/AccountsSidebar.tsx");
+  assert.match(code, /WhatsAppToast\.networkError\("Não foi possível sincronizar/);
+  assert.match(code, /aria-pressed=\{isPinned\}/);
+  assert.match(code, /aria-label="Conectar nova conta de WhatsApp"/);
+});
+
+test("F16/UI12: tema claro torna citacao legivel e a preview fecha so no backdrop", () => {
+  const composer = source("src/features/inbox/components/MessageComposer.tsx");
+  const preview = source("src/features/media/components/MediaPreviewModal.tsx");
+  assert.match(composer, /isDarkMode \? "text-zinc-200" : "text-neutral-800"/);
+  assert.match(preview, /event\.target === event\.currentTarget/);
+});
+
+test("F16/UI13: botoes criticos tem alvo de toque legivel", () => {
+  const css = source("src/styles.css");
+  const settings = source("src/features/inbox/components/SettingsView.tsx");
+  assert.match(css, /\.chat-header-action,[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
+  assert.match(settings, /min-h-11 shrink-0 rounded-xl/);
+});

```

## 9. CONTEXTO COMPLETO HERDADO DA FASE 15 — DOCUMENTO HISTÓRICO INTEGRAL

> MANTIDO SEM CORTES para contexto. Quando houver conflitos, a F16 e o código real prevalecem sobre afirmações da F15.

# INBOXOS — FASE 15 | MASTER HANDOFF / PLANO DE IMPLEMENTAÇÃO PARA ANTIGRAVITY + CODEX

**Data de checkpoint:** 11/10/2026. **Responsabilidade:** frontend corrigido offline nesta rodada; Codex executa backend, build, staging, E2E e produção só após aprovação. **Projeto:** InboxOS / Evolution API v2 / TanStack Start / Netlify / Supabase / Resend / Groq. **Status geral: NO-GO para produção.**

**IMPORTANTE:** Este documento é extensivo de propósito. Deve ser lido **antes da primeira modificação** pelo Antigravity/Codex. Ele guarda contexto de fases anteriores, risco por alteração, comandos reais, permissões, prompts e anexos integrais de patches. **Não reaplique os patches históricos na versão F15.**

## 0. Mandamentos de execução, checkpoints e veracidade

- A **base oficial atual** é o ZIP `inboxos-fase15-frontend-handoff-2026-10-11.zip`, pasta interna `inboxos-evolution-final-audit` contendo `package.json`. SHA256 do ZIP base F14 (antes da edição): `74b11d03cb95c3a5991f7fadf92cd7521ece08194b4acf977b29b924bb44d701`.
- Nenhum código live, banco ou ambiente remoto foi alterado aqui. Não conhecemos credenciais nem o schema efetivamente implantado no Supabase.
- Histórico: F10+hotfix Evolution → F11 → F12 → F13 → F14 UI/UX → **F15 UX resiliente, modal acessível e handoff consolidado**.
- F14 Node: **210 PASS**; F15 Node: **220 PASS / 0 FAIL**. Os **10 novos testes F15 são checagens estáticas de contrato**, não simuladores de navegador. Nem todos os defeitos funcionais podem ser identificados sem compilar e executar a UI.
- Parser/rotas sem dependências: **269 arquivos TypeScript/TSX/MTS, 83 file routes** sem parse/import local falho. **Lockfile FAIL (6 divergências)**; lint/typecheck/build BLOCKED por ferramentas não instaladas.
- **Nunca** chamar de PASS algo apenas preparado: statuses `PASS` (com execução e saída), `FAIL` (falha reproduzida), `BLOCKED` (pré-requisito), `NOT RUN` (não tentado).
- Se o handoff for copiado para GitHub, revistar outputs para eliminar chaves, tokens, URLs privadas e PII; não copiar `.env` reais.
- Separar `APP/preview` de `DB/preview`: configurações declaradas não provam destino verdadeiro. Validar projetos reais, sem imprimir segredos.

## 1. O que eu já alterei nesta F15 e o que você NÃO deve refazer

# InboxOS — Fase 15 | Registro técnico das modificações do frontend

**Data:** 11/10/2026. **Base:** F14 UI/UX + skills (ZIP original). **Escopo:** frontend e regras de execução; backend, migrations e ambientes NÃO foram modificados. **Status:** NO-GO.

| ID | Caminho | Causa observada | Alteração realizada | Risco/regressão | Validação disponível | Aceite em navegador |
|---|---|---|---|---|---|---|
| UI15-01 | `src/features/inbox/components/MessageComposer.tsx` | Clique/Enter imediato podia despachar duas operações antes de `isSending` atualizar | `sendInFlightRef` faz guard síncrono; `finally` limpa estado | Requests antigos em voo; testar duplo clique e troca de conversa | teste estático + suíte Node PASS | Duplo clique → no máx. um envio |
| UI15-02 | `MessageComposer.tsx` | Envio bem-sucedido podia apagar texto novo digitado durante a latência | `setText(current => current.trim()===clean ? "" : current)` | Espaços editados intencionalmente durante envio; validar caso | PASS contrato Node | Texto novo continua no textarea |
| UI15-03 | `MessageComposer.tsx` | Anexo/áudio não partilhavam loading/try/finally do envio de texto | `sendMedia` usa mesma trava, try/catch/finally, desabilita anexos e microfone | Pré-visualização otimista e retry podem manter `blob:` em falha; revisar no hook/backend | PASS contrato Node | Upload/cancel/retry sem enviar duplicado |
| UI15-04 | `MessageComposer.tsx` | Microfone negado não produzia feedback claro | Handler aguarda `startRecording` e avisa erro | Toast pode ser redundante se outro handler exibir erro; inspecionar UI | PASS contrato Node | Negar microfone → aviso legível |
| UI15-05 | `MessageComposer.tsx` | Gravação em `audio/webm` era nomeada `.ogg` | Nome por MIME (`ogg`, `m4a`, `webm`) | Evolution/cliente pode recusar webm; teste E2E de áudio OBRIGATÓRIO | PASS contrato Node | Áudio reproduzível WhatsApp em Android/iOS |
| UI15-06 | `MessageComposer.tsx` | Arquivo vazio era aceito e enviado até API | valida `size === 0` e mantém limite 45 MB anterior | Limite frontend não substitui backend | PASS contrato Node | Arquivo vazio rejeitado sem POST |
| UI15-07 | `src/features/media/components/MediaPreviewModal.tsx` | Modal sem `role=dialog`, retorno de foco e trap para Tab | Modal acessível, foco inicial, Escape, Tab cíclico, foco restaurado | iframe/documento/vídeo e leitores de tela necessitam QA real | PASS contrato Node | Teclado e leitor de tela corretos |
| UI15-08 | `src/features/inbox/components/ImportExportModal.tsx` | Modal sem foco restaurado e sem nome acessível no campo | foco/Tab, heading ID, labels, status, `aria-pressed` | Diálogo re-renderiza durante importação; validar foco | PASS contrato Node | Tab não alcança fundo; retorno ao botão original |
| UI15-09 | `ImportExportModal.tsx` | FileReader de arquivos arbitrariamente grandes ou falhos travava a UX | Limite local 2 MB e `reader.onerror`, reinicia input | Arquivos >2 MB antes aceitos; limite de produto precisa confirmação | PASS contrato Node | Arquivo 3 MB bloqueado sem travar |
| UI15-10 | `src/features/instances/components/QrCodeDialog.tsx` | QR sem restauração de foco nem nome do botão fechar | Trap Tab, Escape, foco original, aria-label | Polling/remontagem podem interferir; testar loading e conexão | PASS contrato Node | Esc funciona e retorna foco |
| UI15-11 | `src/features/inbox/components/MobileDock.tsx` | Badge visual não possuía anúncio único acessível | `aria-label` dinâmico, badge `aria-hidden` | Localização/acessibilidade contador alto | PASS contrato Node | Screenreader anuncia total exato |
| UI15-12 | `package.json`, `tests/uiux-phase15.test.ts` | Faltavam contratos de regressão para mudanças F15 | 10 novos testes Node no comando npm test | Testes estáticos não substituem React/browser | 220/220 Node PASS | Repetir com build e E2E |

## Limitações dos testes

- Os testes novos verificam contratos presentes no código, **não** a interação React montada em navegador, tráfego real da Evolution ou acessibilidade WCAG automaticamente.
- `npm run audit:release`: parse 269 arquivos e 83 rotas PASS, **lockfile FAIL (6)**. Esse comando **não substitui** `tsc` ou build.
- `npm run lint`: BLOCKED `eslint: not found`. `npm run build`: BLOCKED `vite: not found`. Typecheck: BLOCKED `vite/client` ausente.
- Não foram alterados `supabase/migrations`, `src/server/`, `netlify/functions/`, segredos, configurações live nem contas da Evolution.

## Questões adicionais a confirmar (não resolvidas nesta fase)

1. `src/features/inbox/hooks/useMessages.ts`: `updateMessagesState(chatId, updater)` usa `setMessages` do hook ativo sem verificar, no updater, que o chat alvo ainda é o chat exibido. Com requests atrasadas, **há risco de misturar temporariamente mensagens de chats diferentes**. Reproduzir com troca de chat durante upload/resposta, corrigir a menor guarda de identidade e testar com 2 instâncias.
2. `useMessages.ts`: `URL.revokeObjectURL` ocorre na confirmação de sucesso. Em falha/retry, analisar vida útil de `blob:` para não quebrar pré-visualização ou vazar memória; não revogar cegamente quando ainda há mensagem otimista usando o URL.
3. `QrCodeDialog.tsx`: polling assíncrono em fechamento/troca de instância deve ignorar resultados obsoletos. Fazer teste real; não mexer no backend sem contract.
4. `MessageComposer.tsx`: confirmar limites, MIME e transcodificação de áudio pelo backend e Evolution v2. Testar iOS/Android antes de marcar áudio como aprovado.
5. `MediaPreviewModal.tsx`: origem externa de `iframe` deve passar CSP/proxy/autorização do backend; não aceitar URL arbitrária sem avaliar XSS/acesso a mídia de outro tenant.
6. Layout em 320px, zoom 200%, longa duração e rolagem de modal, contraste nos temas, animação reduzida e safe-area continuam sem evidência de navegador.

**Orientação:** resolver qualquer desses problemas com testes de regressão e preservar os patches F11–F15.


### 1.1 Lista completa de arquivos modificados nesta F15

- **M `.agents/skills/inboxos-backend-release/SKILL.md`** — 33 linhas na F15, SHA256 `7aca4ea2f972427e67f50b7f952c9b3a87eb5a0eb384e5fffcd40b3ade5cf227`
- **M `.agents/skills/inboxos-premium-uiux/SKILL.md`** — 55 linhas na F15, SHA256 `cc49215fcbe34fbe21c1b3f2e06fd57628426344127c35ded3cd7871a0193321`
- **M `AGENTS.md`** — 57 linhas na F15, SHA256 `314e8daf3d7873cd830e9e51fd604912a8d5473cc986c787143cf3ef91ea07c1`
- **A `ANTIGRAVITY_INICIO_FASE15.md`** — 12 linhas na F15, SHA256 `6b601824c66d16b6327bd3fa67ea5f9b812212ec2d1aa7fc20fa775c89120720`
- **A `PROMPT_ANTIGRAVITY_CODEX_FASE15.txt`** — 11 linhas na F15, SHA256 `a86be4da53c5437c924d8ab259e3480a50df7b686706c22a9614c289c567995e`
- **A `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md`** — 36 linhas na F15, SHA256 `2056aba6085563262ce3dcff0c8163d64d39e2d7bc70b0ba41881e027f2d27a5`
- **M `package.json`** — 103 linhas na F15, SHA256 `40ae99c18562fb757a1e49c7de3f9e39e65044b5d96080fd896b2cc6aae6acb6`
- **M `src/features/inbox/components/ImportExportModal.tsx`** — 500 linhas na F15, SHA256 `7ac100f9aac2864811885da45fbdb0a88a6635193fb0c5fc88a25c2100af1657`
- **M `src/features/inbox/components/MessageComposer.tsx`** — 506 linhas na F15, SHA256 `d5f8ca27309aba009e7c60084d26c10054710eb8d8eb70b895c58b00be1c5a23`
- **M `src/features/inbox/components/MobileDock.tsx`** — 22 linhas na F15, SHA256 `dd576d052ff1d3705cb012f0cd187569f12259756f3dca83d83d1efb54021ee5`
- **M `src/features/instances/components/QrCodeDialog.tsx`** — 331 linhas na F15, SHA256 `04d41573bf9459449b2f3c21ffdbac552b919e8c1df325bdfb31f478cfd56cf4`
- **M `src/features/media/components/MediaPreviewModal.tsx`** — 124 linhas na F15, SHA256 `88871346acd7081072f8be17e18389470851c99d7a5ae385b46368994c7c6761`
- **A `tests/uiux-phase15.test.ts`** — 79 linhas na F15, SHA256 `b6434a69cb4d2f7c3dbd54d00648c08a839990625e408c4cf6bb0248c5acb870`

### 1.2 Responsabilidades de divisão

**Meu escopo implementado:** UI React/TSX, feedback de envio, modais, proteção de interação, documentação/skills e 10 testes de contrato. Não alterei SDK nem schema, APIs, funções Netlify, workers ou Supabase.

**Seu escopo (Codex/Antigravity):** completar G1 de build; G2 schema/migration RLS staging; G3 contracts/outbox/worker; G4 Evolution/Resend/Groq em sandbox; G5 Deploy Preview/UI browser QA; G6 plano GO/NO-GO sem liberar produção automaticamente. Estudar `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md` e `docs/ANTIGRAVITY_TESTES_EVOLUTION.md` antes de tocar banco/Evolution.

## 2. Evidência técnica REAL nesta F15 (não inventar aprovação)

### 2.1 Node e regressão

```text
node: v22.16.0
npm: 10.9.2
npm test: 220 tests, 220 pass, 0 fail, 0 skipped
```

### 2.2 Auditoria estrutural e lockfile

```text


FAIL package-lock integrity for direct dependencies: 6 issue(s)
PASS TypeScript/TSX/MTS source parsing: 269 files; 0 parse errors
PASS Relative and @/ import resolution: 0 unresolved imports
PASS File routes represented in routeTree: 83 routes; 0 unmatched
PASS Billing guarded behind explicit true flags: Core Billing stays OFF unless explicitly opted in
  dependencies: pacote @lovable.dev/mcp-js existe apenas no lock
  dependencies: pacote @sentry/cloudflare existe apenas no lock
  devDependencies: @netlify/vite-plugin-tanstack-start ausente/divergente no pacote raiz do lock
  devDependencies: pacote instalado @netlify/vite-plugin-tanstack-start não consta no lock
  devDependencies: pacote @lovable.dev/vite-tanstack-config existe apenas no lock
  devDependencies: pacote nitro existe apenas no lock
Preflight blocked: 1 check(s) failed
```

### 2.3 Falhas de infraestrutura — G1 ainda impedido

```text
npm run lint       => sh: 1: eslint: not found (exit 127)
npx --no-install tsc --noEmit => TS2688 Cannot find type definition file for 'vite/client' (exit 2)
npm run build      => sh: 1: vite: not found (exit 127)
npm ci --offline (histórico F14) => ENOTCACHED @netlify/vite-plugin-tanstack-start
```

**Classificação correta:** dependência ausente é BLOCKED, não prova que o TypeScript da aplicação falha; lock divergente é FAIL reprodutível. As demais falhas de compile só podem ser reveladas depois de `npm ci` legítimo.

### 2.4 Six issues precisos e resolução segura

1. `@lovable.dev/mcp-js`: dependência raiz sobrando no lock, não no package.json.
2. `@sentry/cloudflare`: dependência raiz sobrando no lock, não no manifest.
3. `@netlify/vite-plugin-tanstack-start`: `package.json` exige devDependency `1.3.19` mas raiz do lock falta/diverge.
4. `@netlify/vite-plugin-tanstack-start`: pacote instalado/resolução correspondente ausente no lock.
5. `@lovable.dev/vite-tanstack-config`: devDependency raiz obsoleta no lock.
6. `nitro`: devDependency raiz obsoleta no lock.

Não eliminar transitivas legítimas sem árvore de dependências; resolver com npm oficial em registry funcional, sem fabricar integrity. Exigir `git diff -- package-lock.json`, verificar adapter Netlify/TanStack, lock limpo e `npm ci` reproduzível na mesma revisão.

### 2.5 Execução sugerida de G1 em diretório limpo

```bash
node -v; npm -v; npm config get registry; npm ping
# Usar branch isolada; salvar o lockfile anterior e hash.
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
npm run build:gated
# Opcional depois que build passar: npm run dev, Playwright/axe somente se já disponíveis ou adicionados mediante revisão.
```

Não usar `--force`, `--legacy-peer-deps`, downloads de mirrors desconhecidos, `ts-ignore` em massa, edição manual de `integrity` ou desligamento do CI. Conflito de peerDependency exige investigação de versões oficiais atuais e compatibilidade por evidência.

## 3. Backlog operacional ordenado e verificável (P0/P1)

### G0 — integridade, branch, acesso

- [ ] **G0-01 / P0** Verificar SHA do ZIP F15, número de arquivos, `package.json`, `AGENTS.md`, skills; documentar commit SHA real antes de editar.
- [ ] **G0-02 / P0** Criar branch F15 e manter cópia imutável; evitar `git reset --hard` que perca os patches.
- [ ] **G0-03 / P0** Identificar `node/npm` e registry; isolar diretórios de `node_modules` antigos.
- [ ] **G0-04 / P0** Confirmar Billing OFF no core e suas env vars; preservar toggles.
- [ ] **G0-05 / P0 BLOCKED** Staging Supabase com *project ref diferente*, permissões e dados sintéticos.
- [ ] **G0-06 / P0 BLOCKED** Evolution sandbox com instâncias/números de teste autorizados; webhook e auto-resposta separados.
- [ ] **G0-07 / P0 BLOCKED** Secrets de staging isolados no gestor de env, nenhum `VITE_` para secrets.

### G1 — build e qualidade estrita

- [ ] **G1-01 / P0 FAIL** Resolver 6 divergências de lock **pelo npm** (manifest direto versus lock).
- [ ] **G1-02 / P0 BLOCKED** `npm ci` reprodutível; verificar versões pinadas e binários locais.
- [x] **G1-03 / P0 PASS offline** Suite Node 220/220 sobre F15; repetir após lock.
- [ ] **G1-04 / P0 FAIL** `npm run audit:release` PASS completo (hoje falha no lock).
- [ ] **G1-05 / P0 BLOCKED** ESLint sem relaxar regras; corrigir warning/hooks com patch revisável.
- [ ] **G1-06 / P0 BLOCKED** TypeScript sem `any` massivo nem `ts-ignore` generalizado.
- [ ] **G1-07 / P0 BLOCKED** Build Vite real com artefatos SSR/client, routeTree e handlers.
- [ ] **G1-08 / P0 BLOCKED** Netlify gated build com mesma versão e saída auditável.
- [ ] **G1-09 / P1 NOT RUN** Revisão de supply-chain/diff lock e dependências transitivas.

### G2 — Supabase staging e segurança de identidade

- [ ] **G2-01 / P0** Ler histórico migrations e comparar com schema real (SELECT somente leitura). Não presumir migrations aplicadas.
- [ ] **G2-02 / P0** Verificar índices únicos e ON CONFLICT de contatos, presença, grupos; reproduzir 42P10 com fixture quando aplicável.
- [ ] **G2-03 / P0** Diagnosticar risco comprovado no SQL do repo: `messages_workspace_external_key` e lookup RPC somente por `(workspace_id, external_id)` apesar de uso multi-instância. Consultar `scripts/sql/inspect-message-identity-readonly.sql` e distinguir schema live de migrations.
- [ ] **G2-04 / P0** Planejar/adotar em staging migration coordenada de UNIQUE `(workspace_id,instance_id,external_id)` + RPC + leitores/escritores; revisar `client_message_id`, backfill e rollback sem perda. **Não mudar constraint isoladamente**.
- [ ] **G2-05 / P0** Com duas instâncias A/B do mesmo workspace e mesmo `external_id`, confirmar 2 registros independentes e 1 por repetição dentro da instância A.
- [ ] **G2-06 / P0** Reconciliar histórico de migrations somente staging, backup e restore antes de DDL.
- [ ] **G2-07 / P0** RLS/IDOR/BOLA com 2 workspaces e 2 instâncias (chats, mensagens, mídias, CRM, agentes, export, convites); B nunca enxerga A.
- [ ] **G2-08 / P0** Testar concorrência último owner/superadmin e suspensão em transações paralelas.
- [ ] **G2-09 / P0** Testar troca de papel, convite, transferência de owner, revogação de sessão/expiração OTP no request protegido seguinte.
- [ ] **G2-10 / P0** Validar bucket privado, URLs assinadas, cofre criptografado e escopo do serviço.
- [ ] **G2-11 / P0** Ensaiar restore/backups e comportamento pós rollback em staging.
- [x] **G2-12 / PASS offline histórico F12** Escopo por instância em edições/exclusões/reações/fotos; validar DB E2E ainda pendente.
- [x] **G2-13 / PASS offline histórico F12** SQL read-only e plano de migração preparados; DB real ainda pendente.

### G3 — HTTP, workers, Evolution e condição de corrida

- [ ] **G3-01 / P0** Auth HTTP: registro, login, OTP, recuperação, troca e sessão, 200/201/4xx/429 coerentes.
- [ ] **G3-02 / P0** ADM permissões por papel, papel de auditor read-only, convites, suspensão e privilégios somente backend.
- [ ] **G3-03 / P0** Ingress webhook: token inválido/ausente, corpo grande/malformado e replay => falha sem writes.
- [ ] **G3-04 / P0** Idempotência persistida e reconhecimento separado de enqueue/processing/completion.
- [ ] **G3-05 / P0** Worker lease CAS, concorrência, retries/poison/dead_letter, erro Supabase não virar sucesso.
- [ ] **G3-06 / P0** Recovery cron com limite por lote e sem replay de IA aos clientes antigos.
- [ ] **G3-07 / P0** Outbox com mesmo `clientMessageId` em corrida => no máximo um disparo remoto.
- [ ] **G3-08 / P0** Timeout ambíguo: status unknown, reconciliação sem reenviar cegamente.
- [ ] **G3-09 / P0** Edição, exclusão, reação, leitura, entrega, quote e IDs de instância corretos.
- [ ] **G3-10 / P0** Contatos/LIDs/chats/grupos/permissões/caches com dois workspaces e instâncias.
- [ ] **G3-11 / P1** Mídia, foto, áudio webm/ogg/m4a, QR, buckets e assinatura, incluindo falhas de upload.
- [ ] **G3-12 / P1** Cobrir rotas HTTP mapeadas e todas as negativas 401/403/404/409/429/5xx; 83 rotas ≠ 83 contratos.
- [x] **G3-13 / PASS offline F13** Script smoke sintético fail-closed; nunca executar `--execute` sem staging confirmado.
- [ ] **G3-14 / P0 novo F15** Inspecionar `useMessages.ts` `updateMessagesState(chat, updater)` ao alternar chat durante requisição em voo. A função atual atualiza `setMessages` de UI ativa mesmo quando o parâmetro `chat` é antigo, e grava a lista resultante no cache do chat antigo. Reproduzir com A enviando, clicar B, completar A. Corrigir com teste e guards **sem alterar APIs nem descartar mensagens legítimas do chat A**.
- [ ] **G3-15 / P1 novo F15** Auditar ciclo de vida URL `blob:` no envio otimista e retry: `URL.revokeObjectURL` só no sucesso; falhas mantêm URL temporário em `useMessages.ts`. Evitar leak e não quebrar retry/bubble.
- [ ] **G3-16 / P1 novo F15** Validar áudio de navegador com media mimetype, extensão e Evolution v2. A F15 mudou nome do arquivo, NÃO implementou transcodificação.

### G4 — integrações (somente sandbox)

- [ ] Resend OTP e templates: consumo único, expiração, tentativa, rate limit, falha de e-mail e domínio.
- [ ] Resend newsletter opt-in/opt-out; nunca disparar broadcast de produção durante smoke.
- [ ] Groq IA: rate-limit, custos, falhas, proteção replay, não gerar auto-reply durante testes de webhook.
- [ ] Evolution v2 real: versão, conexão, QR, nomes/LIDs/grupos/mídias, envio/recebimento/autorização.
- [ ] Cofre/segredos: rota e log nunca exibem API key; rotação e auditoria.
- [ ] ADM/settings: diferenças operator/auditor/support/superadmin e alterações com trilha.
- [ ] Background Netlify / cron / jobs: repetição segura e limites.
- [ ] Billing permanece OFF, não abrir fork sem outro requisito.

### G5 — Deploy Preview e QA UI/UX **em navegador real**

- [ ] Preview Netlify ligado **somente** a banco staging e Evolution sandbox; validar efetivamente por IDs, não apenas ENV declaradas.
- [ ] Browser desktop 1440x900, 1024x768, tablet 768, mobile 390/360/320; iPhone portrait/landscape/keyboard e zoom 200%.
- [ ] Light/dark, contrastes, glassmorphism, tipografia, largura de header e truncamento nomes longos.
- [ ] Navegação keyboard: Tab/Shift+Tab, Escape, focus-visible, retorno ao gatilho, screen reader em QR, import/export e preview.
- [ ] Envio texto/Enter/Shift+Enter/IME, duplo clique, digitação durante latency, falha HTTP, anexos vazios/45 MB, áudio sem permissão, fim de gravação.
- [ ] Foco em chat A→B enquanto upload A pendente, draft de cada chat, busca global/lista única, filtros e scroll histórico.
- [ ] Verificar panel Admin, settings, CRM, follow-up, agents, dashboard, import/export, conexão QR, badges de não lidas.
- [ ] Gravar screenshots before/after com viewport, theme, commit e URL de preview. Não usar dados reais nos prints.
- [ ] Console 0 hydration warnings relevantes, network 0 endpoints cross-workspace, Lighthouse/axe quando houver ferramenta correta.
- [ ] Testar preferências `prefers-reduced-motion`, safe areas, teclado iOS, scroll dentro de modal e hit target principal >=44px quando viável.

### G6 — release/reversão (NÃO EXECUTAR até gates)

- [ ] CI verde no mesmo commit + staging migrations/restore + Evolution E01–E22 PASS + QA visual PASS.
- [ ] Registro de event backlog, thresholds de errors/latency, observabilidade e plano de retorno.
- [ ] Backup do código e DB; plano de roll-forward para UNIQUE multi-instância; rollback da UNIQUE antiga pode ser impossível sem perda quando novas colisões forem permitidas.
- [ ] Revisão auth/RLS, secrets/CSP, suspensão e controle de contas.
- [ ] Solicitar autorização **explicita e específica** antes de produção, mensagens reais, migration e backlog; não pressupor aprovação.

## 4. Matriz Evolution E01–E22: especificações operacionais

Esta matriz suplementa, **não substitui**, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md` (fonte de casos detalhados). Para cada caso registrar ID, request (sanitizado), worker/log, banco antes/depois e efeito na UI, mantendo automação desligada. Status atual de todos: NOT RUN/BLOCKED em sandbox.

| Caso | Preparação | Ação e resposta esperada | Evidência indispensável |
|---|---|---|---|
| E01 | token omitido/incorreto | 401/403 conforme contrato; sem insert | status HTTP e contagem DB |
| E02 | JSON inválido/corpo maior limite | 400/413 sem exceção 500 | status, log redigido, DB |
| E03 | ID evento repetido em 2 workers | 1 processamento efetivo | eventos gravados e estado |
| E04 | contato com nome válido/LID | mapeamento nome correto | tabela contatos e UI |
| E05 | mesmo ID contato em A e B | escopo por workspace/instance | SELECT A/B distintos |
| E06 | chat histórico/novo/quoted | ordenação, avatar e unread corretos | chat+mensagem UI |
| E07 | presença repetida/out-of-order | conflito alinhado a índice SQL; não regride | índices/staging e presença |
| E08 | grupo subject/admin/participants | permissões atualizadas por instance | cache/UI/gravação |
| E09 | delivered/read receipts | estado monotônico | banco e badge |
| E10 | edit/delete atrasados | só msg correta, sem cross-instance | IDs e filtros |
| E11 | reactions/quoted | mesmo chat/instância | referências e UI |
| E12 | IDs externos iguais, duas instâncias | não colidir/deduplicar entre elas | duas rows independentes |
| E13 | payload malicioso de outro workspace | 403/404/sem vazamento | RLS/HTTP |
| E14 | mesmo clientMessageId em paralelo | no máximo 1 envio remoto | outbox + Evolution log |
| E15 | timeout aceitação ambígua | não reenviar cegamente | transição de estados |
| E16 | erro Supabase/worker | retry, não false completed | fila + eventos |
| E17 | job preso/lease expirado | recupera com limite e idempotência | claim/deadline/log |
| E18 | poison/retry esgotado | dead_letter e alerta, sem avalanche | lista fila |
| E19 | auto-reply desabilitado | nenhum disparo de IA no smoke | configuração e logs |
| E20 | contas de teste autorizadas | mensagem real 2 vias, sem cliente real | duas contas próprias |
| E21 | Deploy Preview + endpoint validado | dry-run sem tráfego; execute somente após checklist | URL/ref e log |
| E22 | health/cron/recovery status | resposta health correta, cron seguro | métricas e SQL |

## 5. Guia de isolamento e autorização com exemplos de falhas

- **Staging ≠ produção.** Gerenciar IDs e envs em secret store, nunca ecoar chaves. No Supabase, checar schema/funcões/policies através de consultas read-only primeiro.
- Na Netlify, confirmar *resolved env* por nome de projeto/ref com logs **sanitizados**; nunca imprimir `DATABASE_URL`, `SERVICE_ROLE`, `EVOLUTION_API_KEY`, token Resend, Groq, JWT signing keys, vault keys.
- Evolution sandbox não pode apontar para webhook live. Mensagens manuais apenas para números autorizados. IA auto-reply OFF de verdade, não só variável declarada.
- Para fixtures, criar **duas empresas A/B** com duas instâncias A1/A2 e usuário de papéis diferentes. UUIDs de B consultados pelo usuário A devem retornar 403/404 ou vazio, nunca dado B.
- `SECURITY DEFINER` sob revisão de dono/search_path/execute grants; políticas RLS com `USING`/`WITH CHECK` de owner efetivo. Não transformar SELECT permissivo em solução de Update 0 rows.
- Proteção de sessão revogada e tokens JWT não deve depender de `user_metadata` editável.
- Ao chegar a uma migration, revisar integridade da UNIQUE antiga + função `persist_inbox_message` + outbox + idempotência + consultas + índices + bloqueios de escrita; mudanças coordenadas em transação de staging, backup e restore demonstrado.
- Produção **nunca** é alvo alternativo para continuar testes quando não há staging.

## 6. Roteiro frontend pós-G1: cenários para reproduzir

| Cenário | Passos no browser | Resultado esperado | Regressão a observar |
|---|---|---|---|
| Envio simultâneo texto | digitar; Enter + click em menos de 50ms | 1 submit, loading, texto preservado | 2 optimistic rows |
| Novo rascunho durante request | digitar A, enviar, durante latência digitar B | A confirmado, B permanece na textarea | B apagado |
| Erro de envio | simular HTTP 500 na conta sandbox | loading libera, conteúdo e resposta mantidos | botão preso/toast duplo |
| Upload de imagem | testar 2 uploads rapidamente | 1 execução enquanto busy | duplicidade/progress inconsistente |
| Arquivo vazio/maior que 45 MB | selecionar arquivo local zero e 46MB | aviso, sem POST | backend recebendo arquivo inválido |
| Microfone negado | bloquear permissão no Chrome/Safari | aviso de permissão; UI não trava | promessa rejeitada não tratada |
| Áudio formatos | Chrome webm, Safari m4a/mp4, outros ogg | nome+MIME coerentes; envio WhatsApp real passa | 415/unsupported format |
| Modais teclado | abrir QR, import, preview, Tab/Shift+Tab e Escape | foco contido, fecha, retorna ao botão de origem | foco no fundo |
| Conversa A e B | iniciar upload A; clicar B antes de completar | nenhuma mensagem A em B | mistura em cache |
| Mídias | abrir URL assinada de A por usuário B | acesso negado | leak CDN/cache |
| Mobile | 320px, dock, composer, header texto longo | nenhum controle invisível | overflow X/teclado cobre botão |
| Exportação | contatos com caracteres especiais e nomes longos | nome acessível, arquivo coerente | truncamento e CSV corrompido |

## 7. Checklist de skill e alinhamento visual

A estrutura está no pacote (workspace), **não** instalada globalmente no seu PC. Verificar no Antigravity do usuário se houve detecção após abrir a raiz.

```text
AGENTS.md
.agents/rules/inboxos-uiux-consistency.md
.agents/rules/evolution-staging.md
.agents/rules/supabase-production-safety.md
.agents/skills/inboxos-premium-uiux/SKILL.md
.agents/skills/inboxos-backend-release/SKILL.md
ANTIGRAVITY_INICIO_FASE15.md
```

Passos: listar skills efetivas → pedir leitura explícita dos dois SKILL.md → comparar `AGENTS.md` → teste de confirmação (agente cita tokens e regras reais) → escopo por arquivo/componente → diffs pequenos → browser QA. Se o plugin Codex não reconhecer `.agents/skills`, instruí-lo a ler os arquivos de maneira explícita; não transferir automaticamente para um diretório global desconhecido.

**Padrão invariável:** glassmorphism discreto, dark black-hole e light off-white, ícones Phosphor, mobile-first e touch acessível, transições suaves, `prefers-reduced-motion`, forms e estados de erro claros, sistema multi-tenant intacto; tipografia legível e alinhamento comum; não usar sombra/luminescência neon, botões sem ações ou CSS global aleatório.

## 8. PROMPT POSITIVO E NEGATIVO integral para colar

```text
# PROMPT POSITIVO — ENVIAR AO ANTIGRAVITY / CODEX

Você está na raiz do InboxOS FASE 15, versão oficial e única. NÃO recupere versões antigas nem substitua esta base por outro repo/ZIP sem diff. Leia `AGENTS.md`, todas as regras `.agents/rules/`, as skills `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/skills/inboxos-backend-release/SKILL.md`, `ANTIGRAVITY_INICIO_FASE15.md`, e TODO o documento `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md`. Confira que as skills estão disponíveis no workspace do agente ou leia-as explicitamente.

1) Inventarie árvore, dependências e estado do repo; faça branch, preserve cópia F15 e registre SHA. 2) Corrija **G1** primeiro, com registry npm legítimo, regenerando lockfile pelo npm, `npm ci` limpo, test, audit:release, lint, tsc, vite build e build:gated; corrija erros reais individualmente, sem suppressions. 3) Em **G2**, crie/identifique STAGING físico isolado, leia schema SQL e conflitos por instância, planeje migration de UNIQUE/RPC coordenada, valide multi-tenant, RLS, session revocation e concorrência; somente staging. 4) Em **G3/G4**, execute contratos HTTP, worker/outbox, Evolution E01–E22, Resend, Groq, auth, admin e uploads com contas de teste; evite envios ambíguos e auto-resposta. 5) Em **G5**, faça Deploy Preview somente staging e QA browser real da UI com a skill premium: 320/360/390/768/1024/1440, light/dark, iOS portrait/landscape, zoom 200, reduced motion, teclado, leitor de tela e falhas de rede. 6) Em **G6**, produza GO/NO-GO com backups, restauração, rollback, observabilidade e aprovação explícita antes de qualquer ação live.

Documente POR ARQUIVO toda mudança: linha/causa anterior → efeito desejado → código modificado → risco/regressão → teste anterior + novo → saída real → rollback. Publique PR revisável, logs sem segredos, checklist atualizado e liste TODOS os bloqueios. Preserve frontend F15, design neutro premium, glassmorphism discreto, Phosphor, mobile-first, UX com movimento suave e billing OFF.

# PROMPT NEGATIVO — PROIBIÇÕES

NÃO reescreva do zero; NÃO copie fase antiga; NÃO apague testes/skills/documentação; NÃO redesenhe aleatoriamente; NÃO altere os contratos de API para ajustar CSS; NÃO troque bibliotecas de ícones; NÃO use neon tóxico; NÃO quebre mobile/light/dark; NÃO crie mock para declarar E2E PASS; NÃO marque build PASS se só passou parse estático. NÃO faça npm --force, --legacy-peer-deps, checksums manuais, NODE_TLS_REJECT_UNAUTHORIZED=0, `ts-ignore` generalizado, supressão ESLint, desativação CI. NÃO use dados reais ou credenciais em logs, PRs, screenshots ou frontend; NÃO execute SQL DDL/DML/migration/db reset/db push/migration repair em produção; NÃO acesse/edite webhooks live, não reenvie mensagens ambíguas, não reprocesse backlog, não ative auto reply nem billing; NÃO publique produção sem autorização explícita. Se faltar acesso, status BLOCKED com prova; trabalhe nas tarefas offline independentes.

```

## 9. Formato de execução do Codex: RELATÓRIOS e critérios de aceite

Para cada tarefa usar modelo:

```text
ID: G1-01
Problema observado:
Causa demonstrada (arquivo, função, query, log):
Arquivos modificados e linhas:
Comportamento antes/depois:
Alteração mínima:
Impacto na UI/SDK/DB/Evolution:
Risco de concorrência/multi-tenancy:
Testes existentes reexecutados:
Teste de regressão novo:
Comandos e saídas (exit codes):
Evidência artefato/link redigido:
Rollback/roll-forward e limites:
Status PASS/FAIL/BLOCKED/NOT RUN:
```

Gerar no mesmo commit `docs/RELATORIO_G1_BUILD.md`, `docs/RELATORIO_G2_STAGING_DB.md`, `docs/RELATORIO_G3_G4_EVOLUTION_E2E.md`, `docs/RELATORIO_G5_UIUX_BROWSER.md`, `docs/RELATORIO_G6_GO_NO_GO.md`, `docs/RELATORIO_EXECUCAO_CODEX.md`. A cada gate, exigir reprodução limpa + critério PASS completo, sem status inventado.

Não existe liberação automática. Mesmo após todos os testes verdes, **solicitar autorização específica para tocar produção**; backlog e envs de produção precisam de aprovações separadas.

## 10. Base histórica: FASE 14 (cópia completa do último handoff, somente contexto)

<details><summary>Handoff completo da Fase 14 — NÃO usar como base para desfazer F15</summary>

# INBOXOS — FASE 14: HANDOFF HISTÓRICO PARA ANTIGRAVITY + CODEX
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


</details>

## 11. Registro de tasks da Fase 13 (cópia histórica — NÃO marcar atual se não reexecutado)

<details><summary>Plano e checklist histórico da Fase 13</summary>

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


</details>

## 12. PATCH COMPLETO DAS MUDANÇAS F15 (inclui frontend, testes, regras e roteiros)

Este diff é reproduzível a partir de F14. **NÃO APLICAR NO ZIP F15, pois já está aplicado.** Ajuda o Codex a entender exatamente o antes/depois por linha.

```diff
diff --git a/.agents/skills/inboxos-backend-release/SKILL.md b/.agents/skills/inboxos-backend-release/SKILL.md
--- a/.agents/skills/inboxos-backend-release/SKILL.md
+++ b/.agents/skills/inboxos-backend-release/SKILL.md
@@ -4,9 +4,11 @@
 ---
 # InboxOS backend & release — Skill para Antigravity/Codex
 
 ## Pré-leitura inegociável
-1. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`
+1. `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md` (fonte de verdade mais recente)
+1b. `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md` (não regredir frontend)
+1c. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md` (histórico somente)
 2. `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`
 3. `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`
 4. `.agents/rules/evolution-staging.md` e `.agents/rules/supabase-production-safety.md`
 5. `package.json`, `package-lock.json`, scripts e migrações atuais
diff --git a/.agents/skills/inboxos-premium-uiux/SKILL.md b/.agents/skills/inboxos-premium-uiux/SKILL.md
--- a/.agents/skills/inboxos-premium-uiux/SKILL.md
+++ b/.agents/skills/inboxos-premium-uiux/SKILL.md
@@ -46,4 +46,10 @@
 - Não quebra navegação, envio, busca, filtros, mensagens, formulário, uploads ou atalhos.
 - Sem truncamentos ilegíveis, controles inalcançáveis, vazamento horizontal, foco invisível ou botão 0x0.
 - Sem novo texto ilegível no claro/escuro, sem contrastes desproporcionais, sem sobreposição com notch e teclado.
 - Testes existentes + regressões novas verdes; browser/produção classificados pela evidência real.
+
+## Atualização Fase 15 (obrigatória)
+- Ler `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md` e `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md` como checkpoint mais novo que F14.
+- Na UI de envio, testar **duplo clique**, resposta pendente + digitação de novo rascunho, erro de upload, erro de microfone e troca de conversa durante envio. Não implementar estados locais duplicados.
+- Em modais de QR/importação/preview, manter `aria-modal`, trap Tab, Escape, retorno de foco, rótulo e estado; validar teclado e leitura de tela reais.
+- Não confundir `npm test` com prova visual ou E2E. Precisamos de screenshots dos breakpoints e logs de console/rede após resolver G1.
diff --git a/AGENTS.md b/AGENTS.md
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -47,4 +47,11 @@
 ## Atualização Fase 14 — skills de manutenção
 - Para alterações de UI/UX, aplicar `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/rules/inboxos-uiux-consistency.md`.
 - Para backend/build/Netlify/Supabase/Evolution, aplicar `.agents/skills/inboxos-backend-release/SKILL.md` e o handoff `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`.
 - Manter edição de UI separada de migrations e mutações em produção. Exigir evidência antes de marcar gates de release como PASS.
+
+## Checkpoint Fase 15 — fonte de verdade atual (11/10/2026)
+- **A versão oficial desta pasta é a FASE 15, não o ZIP antigo citado na missão histórica acima.** Não voltar a fases anteriores nem reaplicar patches antigos sobre F15.
+- **LEITURA OBRIGATÓRIA ANTES DE EDITAR:** `ANTIGRAVITY_INICIO_FASE15.md`, `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md`, `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md`, `.agents/skills/inboxos-premium-uiux/SKILL.md`, `.agents/skills/inboxos-backend-release/SKILL.md`.
+- Divisão de trabalho: frontend F15 já corrigido offline; Codex/Antigravity assume G1–G6 e browser QA, sem comprometer a segurança de produção.
+- 220/220 testes Node foram aprovados na F15; **lint, typecheck, build, migrations e E2E não estão aprovados**. O status é NO-GO.
+- Alterações no frontend devem seguir testes de regressão e evidência visual; alterações no backend devem seguir gates de staging e autorização explícita antes de produção.
diff --git a/ANTIGRAVITY_INICIO_FASE15.md b/ANTIGRAVITY_INICIO_FASE15.md
new file mode 100644
--- /dev/null
+++ b/ANTIGRAVITY_INICIO_FASE15.md
@@ -0,0 +1,12 @@
+# LEIA PRIMEIRO — InboxOS Fase 15, transferência para Antigravity + Codex
+
+1. Abra **esta pasta**, aquela onde estão `package.json` e `AGENTS.md`. Esta é a versão oficial F15.
+2. Abra e siga `AGENTS.md` + `.agents/rules/*.md`. Leia ambas as skills: `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/skills/inboxos-backend-release/SKILL.md`. **Confira no seu Antigravity se as skills são reconhecidas**; se não, leia os arquivos manualmente e configure seu ambiente. Não presumir instalação global.
+3. Leia INTEGRALMENTE `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md` e `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md`. O documento grande inclui diff das correções e histórico de patches F11–F14.
+4. Leia `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md` e `.agents/rules/supabase-production-safety.md`.
+5. Crie branch a partir desta pasta **sem mesclar de volta código antigo**. Registre SHA256/commit.
+6. Inicie por G1 (npm oficial, lock, ci, lint, typecheck, build, gated) até obter logs reproduzíveis.
+7. Só depois executar G2–G5 com banco Supabase staging **distinto** da produção, Evolution isolada, contas próprias. Não alterar produção sem autorização posterior e específica.
+8. Ao finalizar, entregar PR/patch e `docs/RELATORIO_EXECUCAO_CODEX.md` com status PASS/FAIL/BLOCKED/NOT RUN e evidências. Release NO-GO até aprovação.
+
+A base F15 já contém as correções UI e 220 testes Node PASS. **Não reaplicar os patches históricos F11–F14**.
diff --git a/PROMPT_ANTIGRAVITY_CODEX_FASE15.txt b/PROMPT_ANTIGRAVITY_CODEX_FASE15.txt
new file mode 100644
--- /dev/null
+++ b/PROMPT_ANTIGRAVITY_CODEX_FASE15.txt
@@ -0,0 +1,11 @@
+# PROMPT POSITIVO — ENVIAR AO ANTIGRAVITY / CODEX
+
+Você está na raiz do InboxOS FASE 15, versão oficial e única. NÃO recupere versões antigas nem substitua esta base por outro repo/ZIP sem diff. Leia `AGENTS.md`, todas as regras `.agents/rules/`, as skills `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/skills/inboxos-backend-release/SKILL.md`, `ANTIGRAVITY_INICIO_FASE15.md`, e TODO o documento `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md`. Confira que as skills estão disponíveis no workspace do agente ou leia-as explicitamente.
+
+1) Inventarie árvore, dependências e estado do repo; faça branch, preserve cópia F15 e registre SHA. 2) Corrija **G1** primeiro, com registry npm legítimo, regenerando lockfile pelo npm, `npm ci` limpo, test, audit:release, lint, tsc, vite build e build:gated; corrija erros reais individualmente, sem suppressions. 3) Em **G2**, crie/identifique STAGING físico isolado, leia schema SQL e conflitos por instância, planeje migration de UNIQUE/RPC coordenada, valide multi-tenant, RLS, session revocation e concorrência; somente staging. 4) Em **G3/G4**, execute contratos HTTP, worker/outbox, Evolution E01–E22, Resend, Groq, auth, admin e uploads com contas de teste; evite envios ambíguos e auto-resposta. 5) Em **G5**, faça Deploy Preview somente staging e QA browser real da UI com a skill premium: 320/360/390/768/1024/1440, light/dark, iOS portrait/landscape, zoom 200, reduced motion, teclado, leitor de tela e falhas de rede. 6) Em **G6**, produza GO/NO-GO com backups, restauração, rollback, observabilidade e aprovação explícita antes de qualquer ação live.
+
+Documente POR ARQUIVO toda mudança: linha/causa anterior → efeito desejado → código modificado → risco/regressão → teste anterior + novo → saída real → rollback. Publique PR revisável, logs sem segredos, checklist atualizado e liste TODOS os bloqueios. Preserve frontend F15, design neutro premium, glassmorphism discreto, Phosphor, mobile-first, UX com movimento suave e billing OFF.
+
+# PROMPT NEGATIVO — PROIBIÇÕES
+
+NÃO reescreva do zero; NÃO copie fase antiga; NÃO apague testes/skills/documentação; NÃO redesenhe aleatoriamente; NÃO altere os contratos de API para ajustar CSS; NÃO troque bibliotecas de ícones; NÃO use neon tóxico; NÃO quebre mobile/light/dark; NÃO crie mock para declarar E2E PASS; NÃO marque build PASS se só passou parse estático. NÃO faça npm --force, --legacy-peer-deps, checksums manuais, NODE_TLS_REJECT_UNAUTHORIZED=0, `ts-ignore` generalizado, supressão ESLint, desativação CI. NÃO use dados reais ou credenciais em logs, PRs, screenshots ou frontend; NÃO execute SQL DDL/DML/migration/db reset/db push/migration repair em produção; NÃO acesse/edite webhooks live, não reenvie mensagens ambíguas, não reprocesse backlog, não ative auto reply nem billing; NÃO publique produção sem autorização explícita. Se faltar acesso, status BLOCKED com prova; trabalhe nas tarefas offline independentes.
diff --git a/docs/FASE15_REGISTRO_MUDANCAS_UIUX.md b/docs/FASE15_REGISTRO_MUDANCAS_UIUX.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE15_REGISTRO_MUDANCAS_UIUX.md
@@ -0,0 +1,36 @@
+# InboxOS — Fase 15 | Registro técnico das modificações do frontend
+
+**Data:** 11/10/2026. **Base:** F14 UI/UX + skills (ZIP original). **Escopo:** frontend e regras de execução; backend, migrations e ambientes NÃO foram modificados. **Status:** NO-GO.
+
+| ID | Caminho | Causa observada | Alteração realizada | Risco/regressão | Validação disponível | Aceite em navegador |
+|---|---|---|---|---|---|---|
+| UI15-01 | `src/features/inbox/components/MessageComposer.tsx` | Clique/Enter imediato podia despachar duas operações antes de `isSending` atualizar | `sendInFlightRef` faz guard síncrono; `finally` limpa estado | Requests antigos em voo; testar duplo clique e troca de conversa | teste estático + suíte Node PASS | Duplo clique → no máx. um envio |
+| UI15-02 | `MessageComposer.tsx` | Envio bem-sucedido podia apagar texto novo digitado durante a latência | `setText(current => current.trim()===clean ? "" : current)` | Espaços editados intencionalmente durante envio; validar caso | PASS contrato Node | Texto novo continua no textarea |
+| UI15-03 | `MessageComposer.tsx` | Anexo/áudio não partilhavam loading/try/finally do envio de texto | `sendMedia` usa mesma trava, try/catch/finally, desabilita anexos e microfone | Pré-visualização otimista e retry podem manter `blob:` em falha; revisar no hook/backend | PASS contrato Node | Upload/cancel/retry sem enviar duplicado |
+| UI15-04 | `MessageComposer.tsx` | Microfone negado não produzia feedback claro | Handler aguarda `startRecording` e avisa erro | Toast pode ser redundante se outro handler exibir erro; inspecionar UI | PASS contrato Node | Negar microfone → aviso legível |
+| UI15-05 | `MessageComposer.tsx` | Gravação em `audio/webm` era nomeada `.ogg` | Nome por MIME (`ogg`, `m4a`, `webm`) | Evolution/cliente pode recusar webm; teste E2E de áudio OBRIGATÓRIO | PASS contrato Node | Áudio reproduzível WhatsApp em Android/iOS |
+| UI15-06 | `MessageComposer.tsx` | Arquivo vazio era aceito e enviado até API | valida `size === 0` e mantém limite 45 MB anterior | Limite frontend não substitui backend | PASS contrato Node | Arquivo vazio rejeitado sem POST |
+| UI15-07 | `src/features/media/components/MediaPreviewModal.tsx` | Modal sem `role=dialog`, retorno de foco e trap para Tab | Modal acessível, foco inicial, Escape, Tab cíclico, foco restaurado | iframe/documento/vídeo e leitores de tela necessitam QA real | PASS contrato Node | Teclado e leitor de tela corretos |
+| UI15-08 | `src/features/inbox/components/ImportExportModal.tsx` | Modal sem foco restaurado e sem nome acessível no campo | foco/Tab, heading ID, labels, status, `aria-pressed` | Diálogo re-renderiza durante importação; validar foco | PASS contrato Node | Tab não alcança fundo; retorno ao botão original |
+| UI15-09 | `ImportExportModal.tsx` | FileReader de arquivos arbitrariamente grandes ou falhos travava a UX | Limite local 2 MB e `reader.onerror`, reinicia input | Arquivos >2 MB antes aceitos; limite de produto precisa confirmação | PASS contrato Node | Arquivo 3 MB bloqueado sem travar |
+| UI15-10 | `src/features/instances/components/QrCodeDialog.tsx` | QR sem restauração de foco nem nome do botão fechar | Trap Tab, Escape, foco original, aria-label | Polling/remontagem podem interferir; testar loading e conexão | PASS contrato Node | Esc funciona e retorna foco |
+| UI15-11 | `src/features/inbox/components/MobileDock.tsx` | Badge visual não possuía anúncio único acessível | `aria-label` dinâmico, badge `aria-hidden` | Localização/acessibilidade contador alto | PASS contrato Node | Screenreader anuncia total exato |
+| UI15-12 | `package.json`, `tests/uiux-phase15.test.ts` | Faltavam contratos de regressão para mudanças F15 | 10 novos testes Node no comando npm test | Testes estáticos não substituem React/browser | 220/220 Node PASS | Repetir com build e E2E |
+
+## Limitações dos testes
+
+- Os testes novos verificam contratos presentes no código, **não** a interação React montada em navegador, tráfego real da Evolution ou acessibilidade WCAG automaticamente.
+- `npm run audit:release`: parse 269 arquivos e 83 rotas PASS, **lockfile FAIL (6)**. Esse comando **não substitui** `tsc` ou build.
+- `npm run lint`: BLOCKED `eslint: not found`. `npm run build`: BLOCKED `vite: not found`. Typecheck: BLOCKED `vite/client` ausente.
+- Não foram alterados `supabase/migrations`, `src/server/`, `netlify/functions/`, segredos, configurações live nem contas da Evolution.
+
+## Questões adicionais a confirmar (não resolvidas nesta fase)
+
+1. `src/features/inbox/hooks/useMessages.ts`: `updateMessagesState(chatId, updater)` usa `setMessages` do hook ativo sem verificar, no updater, que o chat alvo ainda é o chat exibido. Com requests atrasadas, **há risco de misturar temporariamente mensagens de chats diferentes**. Reproduzir com troca de chat durante upload/resposta, corrigir a menor guarda de identidade e testar com 2 instâncias.
+2. `useMessages.ts`: `URL.revokeObjectURL` ocorre na confirmação de sucesso. Em falha/retry, analisar vida útil de `blob:` para não quebrar pré-visualização ou vazar memória; não revogar cegamente quando ainda há mensagem otimista usando o URL.
+3. `QrCodeDialog.tsx`: polling assíncrono em fechamento/troca de instância deve ignorar resultados obsoletos. Fazer teste real; não mexer no backend sem contract.
+4. `MessageComposer.tsx`: confirmar limites, MIME e transcodificação de áudio pelo backend e Evolution v2. Testar iOS/Android antes de marcar áudio como aprovado.
+5. `MediaPreviewModal.tsx`: origem externa de `iframe` deve passar CSP/proxy/autorização do backend; não aceitar URL arbitrária sem avaliar XSS/acesso a mídia de outro tenant.
+6. Layout em 320px, zoom 200%, longa duração e rolagem de modal, contraste nos temas, animação reduzida e safe-area continuam sem evidência de navegador.
+
+**Orientação:** resolver qualquer desses problemas com testes de regressão e preservar os patches F11–F15.
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -9,9 +9,9 @@
     "build:dev": "vite build --mode development",
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts tests/uiux-phase14.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts tests/uiux-phase14.test.ts tests/uiux-phase15.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
     "build:gated": "node scripts/netlify-build-gate.mjs"
diff --git a/src/features/inbox/components/ImportExportModal.tsx b/src/features/inbox/components/ImportExportModal.tsx
--- a/src/features/inbox/components/ImportExportModal.tsx
+++ b/src/features/inbox/components/ImportExportModal.tsx
@@ -36,17 +36,46 @@
   const [importInput, setImportInput] = useState("");
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [importResult, setImportResult] = useState<{ count: number } | null>(null);
   const fileInputRef = useRef<HTMLInputElement | null>(null);
-
+  const dialogRef = useRef<HTMLDivElement | null>(null);
+  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
+  const onCloseRef = useRef(onClose);
+  onCloseRef.current = onClose;
+
+  // Mantém a tabulação dentro do modal e devolve o foco ao disparador.
   useEffect(() => {
     if (!isOpen) return;
-    const handleKeyDown = (e: KeyboardEvent) => {
-      if (e.key === "Escape") onClose();
+    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+    closeButtonRef.current?.focus();
+    const handleKeyDown = (event: KeyboardEvent) => {
+      if (event.key === "Escape") {
+        event.preventDefault();
+        onCloseRef.current();
+        return;
+      }
+      if (event.key !== "Tab") return;
+      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
+        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
+      ) || []).filter((el) => el.getClientRects().length > 0);
+      if (!controls.length) return;
+      const first = controls[0]!;
+      const last = controls[controls.length - 1]!;
+      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        last.focus();
+      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        first.focus();
+      }
     };
-    window.addEventListener("keydown", handleKeyDown);
-    return () => window.removeEventListener("keydown", handleKeyDown);
-  }, [isOpen, onClose]);
+    document.addEventListener("keydown", handleKeyDown);
+    return () => {
+      document.removeEventListener("keydown", handleKeyDown);
+      if (previouslyFocused?.isConnected) previouslyFocused.focus();
+    };
+  }, [isOpen]);
+
 
   if (!isOpen) return null;
 
   // Exportar conversa atual como arquivo TXT formatado
@@ -118,16 +147,24 @@
   const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
 
+    // Evita travamento do browser ao abrir arquivos gigantes; backend tem limites próprios.
+    if (file.size > 2 * 1024 * 1024) {
+      WhatsAppToast.fileTooLarge(2);
+      e.currentTarget.value = "";
+      return;
+    }
     const reader = new FileReader();
+    reader.onerror = () => WhatsAppToast.networkError("Não foi possível ler o arquivo selecionado.");
     reader.onload = (event) => {
       const text = event.target?.result as string;
       if (text) {
         setImportInput(text);
       }
     };
     reader.readAsText(file);
+    e.currentTarget.value = "";
   };
 
   // Envia contatos para a rota de importação
   const handleImportSubmit = async () => {
@@ -211,10 +248,12 @@
             ? "bg-[#111216] border-white/[0.12] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
             : "bg-white border-neutral-200 text-neutral-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
         }`}
         onClick={(e) => e.stopPropagation()}
+        ref={dialogRef}
         role="dialog"
         aria-modal="true"
+        aria-labelledby="import-export-dialog-title"
       >
         {/* Cabeçalho */}
         <div className="relative flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
           <div className="flex items-center gap-3">
@@ -225,18 +264,20 @@
                 <UploadSimple size={22} weight="bold" />
               )}
             </div>
             <div>
-              <h3 className="text-base font-bold tracking-tight">Importação & Exportação</h3>
+              <h3 id="import-export-dialog-title" className="text-base font-bold tracking-tight">Importação & Exportação</h3>
               <p className="text-xs text-neutral-400 mt-0.5">
                 Gerencie histórico e contatos do WhatsApp
               </p>
             </div>
           </div>
 
           <button
             type="button"
+            ref={closeButtonRef}
             onClick={onClose}
+            aria-label="Fechar importação e exportação"
             className={`p-2 rounded-lg transition-colors ${
               isDarkMode
                 ? "text-neutral-400 hover:text-white hover:bg-white/10"
                 : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100"
@@ -250,8 +291,9 @@
         <div className="flex gap-2 mt-4 p-1 rounded-xl bg-neutral-500/10 border border-white/5">
           <button
             type="button"
             onClick={() => setTab("export")}
+            aria-pressed={tab === "export"}
             className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
               tab === "export"
                 ? isDarkMode
                   ? "bg-white/[0.11] text-white"
@@ -267,8 +309,9 @@
 
           <button
             type="button"
             onClick={() => setTab("import")}
+            aria-pressed={tab === "import"}
             className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
               tab === "import"
                 ? isDarkMode
                   ? "bg-white/[0.11] text-white"
@@ -408,8 +451,9 @@
                 </button>
               </div>
 
               <textarea
+                aria-label="Contatos para importar em formato CSV ou JSON"
                 rows={5}
                 value={importInput}
                 onChange={(e) => setImportInput(e.target.value)}
                 placeholder={
@@ -422,9 +466,9 @@
                 }`}
               />
 
               {importResult && (
-                <div className="flex items-center gap-2 text-xs font-semibold text-[#00a884] animate-smooth-in">
+                <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-semibold text-[#00a884] animate-smooth-in">
                   <CheckCircle size={16} weight="fill" />
                   <span>{importResult.count} contatos/conversas sincronizados com sucesso!</span>
                 </div>
               )}
diff --git a/src/features/inbox/components/MessageComposer.tsx b/src/features/inbox/components/MessageComposer.tsx
--- a/src/features/inbox/components/MessageComposer.tsx
+++ b/src/features/inbox/components/MessageComposer.tsx
@@ -64,8 +64,11 @@
   const fileInputRef = useRef<HTMLInputElement | null>(null);
   const docInputRef = useRef<HTMLInputElement | null>(null);
   const attachMenuRef = useRef<HTMLDivElement | null>(null);
   const inputRef = useRef<HTMLTextAreaElement | null>(null);
+  // O ref impede envios simultâneos até antes da próxima renderização do React.
+  const sendInFlightRef = useRef(false);
+  const audioStopInFlightRef = useRef(false);
 
   const { isRecording, recordingTimer, startRecording, stopRecording, cancelRecording } =
     useAudioRecorder();
 
@@ -105,10 +108,11 @@
 
   const handleSendText = async (e?: React.FormEvent) => {
     if (e) e.preventDefault();
     const clean = text.trim();
-    if (!clean || isSending) return;
-
+    if (!clean || sendInFlightRef.current) return;
+
+    sendInFlightRef.current = true;
     setIsSending(true);
     const quotedPayload = replyingTo
       ? {
           quotedMessageId: replyingTo.externalId || undefined,
@@ -131,16 +135,18 @@
 
     try {
       const ok = await onSendMessage({ text: clean, type: "text", ...quotedPayload });
       if (ok) {
-        setText("");
-        if (inputRef.current) inputRef.current.style.height = "auto";
+        // Não apagar um novo rascunho digitado enquanto o request estava pendente.
+        setText((current) => current.trim() === clean ? "" : current);
+        if (inputRef.current?.value.trim() === clean) inputRef.current.style.height = "auto";
         if (onCancelReply) onCancelReply();
       }
     } catch {
       WhatsAppToast.networkError("Não foi possível enviar a mensagem. Tente novamente.");
     } finally {
       // Mesmo em falha de rede o usuário pode corrigir o texto e tentar de novo.
+      sendInFlightRef.current = false;
       setIsSending(false);
     }
   };
 
@@ -177,12 +183,82 @@
       }
     }
   };
 
+  // Uma única operação de envio por vez, inclusive anexos e gravações.
+  // onSendMessage já mostra toast quando retorna false; só mostramos toast em throws.
+  const sendMedia = async (payload: Parameters<typeof onSendMessage>[0]) => {
+    if (sendInFlightRef.current) return;
+    sendInFlightRef.current = true;
+    setIsSending(true);
+    try {
+      const ok = await onSendMessage(payload);
+      if (ok) onCancelReply?.();
+    } catch {
+      WhatsAppToast.networkError("Não foi possível enviar a mídia. Tente novamente.");
+    } finally {
+      sendInFlightRef.current = false;
+      setIsSending(false);
+    }
+  };
+
+  const handleStartRecording = async () => {
+    if (sendInFlightRef.current) return;
+    try {
+      const started = await startRecording();
+      if (!started) WhatsAppToast.networkError("Não foi possível acessar o microfone. Confira a permissão do navegador.");
+    } catch {
+      WhatsAppToast.networkError("Falha ao iniciar gravação de áudio.");
+    }
+  };
+
   const handleAudioSend = async () => {
-    const res = await stopRecording();
-    if (!res) return;
-
+    if (sendInFlightRef.current || audioStopInFlightRef.current) return;
+    audioStopInFlightRef.current = true;
+    try {
+      const res = await stopRecording();
+      if (!res) return;
+
+      const quotedPayload = replyingTo
+        ? {
+            quotedMessageId: replyingTo.externalId || undefined,
+            quotedMessage: {
+              senderName: replyingTo.senderName || null,
+              senderPhone: replyingTo.senderPhone || null,
+              text: replyingTo.text || "Mensagem",
+              type: replyingTo.type,
+            },
+          }
+        : {};
+      const extension = res.blob.type.includes("ogg") ? "ogg" : res.blob.type.includes("mp4") ? "m4a" : "webm";
+      await sendMedia({
+        media: URL.createObjectURL(res.blob),
+        mediaFile: res.blob,
+        fileName: `audio-${Date.now()}.${extension}`,
+        mimetype: res.blob.type || "audio/webm",
+        duration: res.durationSec,
+        type: "audio",
+        ...quotedPayload,
+      });
+    } catch {
+      WhatsAppToast.networkError("Não foi possível finalizar a gravação.");
+    } finally {
+      audioStopInFlightRef.current = false;
+    }
+  };
+
+  const handleFileUpload = async (file: File, type: "image" | "video" | "document") => {
+    setIsAttachOpen(false);
+    if (!file || sendInFlightRef.current) return;
+    if (file.size === 0) {
+      WhatsAppToast.networkError("Este arquivo está vazio. Escolha outro arquivo.");
+      return;
+    }
+    // Preserva o limite anterior de 45 MB; backend precisa validar novamente.
+    if (file.size > 45 * 1024 * 1024) {
+      WhatsAppToast.fileTooLarge(45);
+      return;
+    }
     const quotedPayload = replyingTo
       ? {
           quotedMessageId: replyingTo.externalId || undefined,
           quotedMessage: {
@@ -193,55 +269,20 @@
           },
         }
       : {};
 
-    const ok = await onSendMessage({
-      media: URL.createObjectURL(res.blob),
-      mediaFile: res.blob,
-      fileName: `audio-${Date.now()}.ogg`,
-      mimetype: res.blob.type || "audio/ogg",
-      duration: res.durationSec,
-      type: "audio",
-      ...quotedPayload,
-    });
-    if (ok && onCancelReply) onCancelReply();
-  };
-
-  const handleFileUpload = async (file: File, type: "image" | "video" | "document") => {
-    setIsAttachOpen(false);
-    if (!file) return;
-
-    // Validação de limite oficial de mídia do WhatsApp (45MB)
-    if (file.size > 45 * 1024 * 1024) {
-      WhatsAppToast.fileTooLarge(45);
-      return;
-    }
-
-    const quotedPayload = replyingTo
-      ? {
-          quotedMessageId: replyingTo.externalId || undefined,
-          quotedMessage: {
-            senderName: replyingTo.senderName || null,
-            senderPhone: replyingTo.senderPhone || null,
-            text: replyingTo.text || "Mensagem",
-            type: replyingTo.type,
-          },
-        }
-      : {};
-
-    const ok = await onSendMessage({
+    await sendMedia({
       media: URL.createObjectURL(file),
       mediaFile: file,
       fileName: file.name,
       mimetype: file.type || "application/octet-stream",
       type,
       ...quotedPayload,
     });
-    if (ok && onCancelReply) onCancelReply();
   };
 
   return (
-    <div className="message-composer flex flex-col shrink-0">
+    <div className="message-composer flex flex-col shrink-0" aria-busy={isSending}>
       {/* Barra Flutuante de Resposta / Citação (Quote Bar) */}
       {replyingTo &&
         (() => {
           const cleanReplyingSender = sanitizeSenderName(
@@ -347,8 +388,9 @@
           {/* Inputs Ocultos de Arquivo */}
           <input
             ref={fileInputRef}
             type="file"
+            disabled={isSending}
             accept="image/*,video/*"
             className="hidden"
             onChange={(e) => {
               const file = e.target.files?.[0];
@@ -361,8 +403,9 @@
           />
           <input
             ref={docInputRef}
             type="file"
+            disabled={isSending}
             accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
             className="hidden"
             onChange={(e) => {
               const file = e.target.files?.[0];
@@ -383,8 +426,9 @@
               {/* Botão de Anexo */}
               <button
                 type="button"
                 onClick={() => setIsAttachOpen(!isAttachOpen)}
+                disabled={isSending}
                 className={`p-2.5 rounded-lg transition-colors ${
                   isAttachOpen
                     ? isDarkMode
                       ? "bg-white/[0.07] text-white"
@@ -421,8 +465,12 @@
                     : "bg-neutral-50 border-neutral-200 text-neutral-950 placeholder-neutral-400 focus:border-neutral-400"
                 }`}
               />
 
+              <span className="sr-only" role="status" aria-live="polite">
+                {isSending ? "Enviando mensagem..." : ""}
+              </span>
+
               {/* Botão de Gravar Áudio ou Enviar Texto */}
               {text.trim() ? (
                 <button
                   type="submit"
@@ -435,9 +483,10 @@
                 </button>
               ) : (
                 <button
                   type="button"
-                  onClick={startRecording}
+                  onClick={() => void handleStartRecording()}
+                  disabled={isSending}
                   className={`p-2.5 rounded-lg transition-colors ${
                     isDarkMode
                       ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                       : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
diff --git a/src/features/inbox/components/MobileDock.tsx b/src/features/inbox/components/MobileDock.tsx
--- a/src/features/inbox/components/MobileDock.tsx
+++ b/src/features/inbox/components/MobileDock.tsx
@@ -12,10 +12,10 @@
 export function MobileDock({ currentView, onSelectView, unread = 0, dark = true }: { currentView: AppView; onSelectView: (view: AppView) => void; unread?: number; dark?: boolean }) {
   return <nav className={`mobile-dock ${dark ? "mobile-dock-dark" : "mobile-dock-light"}`} aria-label="Navegação principal">
     {items.map(({ id, label, icon: Icon }) => {
       const active = currentView === id;
-      return <button key={id} type="button" onClick={() => onSelectView(id)} className={`mobile-dock-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
-        <span className="relative"><Icon size={20} weight={active ? "fill" : "regular"}/>{id === "inbox" && unread > 0 && <span className="mobile-dock-badge">{unread > 99 ? "99+" : unread}</span>}</span>
+      return <button key={id} type="button" onClick={() => onSelectView(id)} className={`mobile-dock-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} aria-label={id === "inbox" && unread > 0 ? `Inbox, ${unread} mensagens não lidas` : label}>
+        <span className="relative"><Icon size={20} weight={active ? "fill" : "regular"}/>{id === "inbox" && unread > 0 && <span aria-hidden="true" className="mobile-dock-badge">{unread > 99 ? "99+" : unread}</span>}</span>
         <span>{label}</span>
       </button>;
     })}
   </nav>;
diff --git a/src/features/instances/components/QrCodeDialog.tsx b/src/features/instances/components/QrCodeDialog.tsx
--- a/src/features/instances/components/QrCodeDialog.tsx
+++ b/src/features/instances/components/QrCodeDialog.tsx
@@ -33,8 +33,12 @@
   const statusRef = useRef(status);
   const requestInFlightRef = useRef(false);
   const initializedInstanceRef = useRef<string | null>(null);
   const onConnectedRef = useRef(onConnected);
+  const dialogRef = useRef<HTMLDivElement | null>(null);
+  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
+  const onCloseRef = useRef(onClose);
+  onCloseRef.current = onClose;
   statusRef.current = status;
   onConnectedRef.current = onConnected;
 
   useEffect(() => {
@@ -42,16 +46,40 @@
       (current) => initialName?.trim() || current || `WhatsApp_${Date.now().toString().slice(-4)}`,
     );
   }, [initialName]);
 
+  // Mantém a tabulação dentro do modal e devolve o foco ao disparador.
   useEffect(() => {
     if (!isOpen) return;
+    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+    closeButtonRef.current?.focus();
     const handleKeyDown = (event: KeyboardEvent) => {
-      if (event.key === "Escape") onClose();
+      if (event.key === "Escape") {
+        event.preventDefault();
+        onCloseRef.current();
+        return;
+      }
+      if (event.key !== "Tab") return;
+      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
+        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
+      ) || []).filter((el) => el.getClientRects().length > 0);
+      if (!controls.length) return;
+      const first = controls[0]!;
+      const last = controls[controls.length - 1]!;
+      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        last.focus();
+      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
+        event.preventDefault();
+        first.focus();
+      }
     };
     document.addEventListener("keydown", handleKeyDown);
-    return () => document.removeEventListener("keydown", handleKeyDown);
-  }, [isOpen, onClose]);
+    return () => {
+      document.removeEventListener("keydown", handleKeyDown);
+      if (previouslyFocused?.isConnected) previouslyFocused.focus();
+    };
+  }, [isOpen]);
 
   const loadQrCode = useCallback(async (targetName: string) => {
     const validName = targetName.trim();
     if (!validName || requestInFlightRef.current) return;
@@ -136,8 +164,9 @@
             ? "bg-[#111216] border-white/[0.12] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
             : "bg-white border-neutral-200 text-neutral-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
         }`}
         onClick={(e) => e.stopPropagation()}
+        ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-labelledby="qr-dialog-title"
       >
@@ -163,9 +192,11 @@
           </div>
 
           <button
             type="button"
+            ref={closeButtonRef}
             onClick={onClose}
+            aria-label="Fechar conexão WhatsApp"
             className={`p-2 rounded-xl transition-colors ${
               isDarkMode
                 ? "text-neutral-400 hover:text-white hover:bg-white/10"
                 : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100"
diff --git a/src/features/media/components/MediaPreviewModal.tsx b/src/features/media/components/MediaPreviewModal.tsx
--- a/src/features/media/components/MediaPreviewModal.tsx
+++ b/src/features/media/components/MediaPreviewModal.tsx
@@ -1,5 +1,5 @@
-import { useEffect } from 'react';
+import { useEffect, useRef } from 'react';
 import { X, DownloadSimple } from '@phosphor-icons/react';
 
 interface MediaPreviewModalProps {
   media: {
@@ -10,23 +10,52 @@
   onClose: () => void;
 }
 
 export function MediaPreviewModal({ media, onClose }: MediaPreviewModalProps) {
+  const dialogRef = useRef<HTMLDivElement | null>(null);
+  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
+  const closeRef = useRef(onClose);
+  closeRef.current = onClose;
+
   useEffect(() => {
+    if (!media) return;
+    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
+    closeButtonRef.current?.focus();
     const handleKeyDown = (e: KeyboardEvent) => {
-      if (e.key === 'Escape') onClose();
+      if (e.key === 'Escape') {
+        e.preventDefault();
+        closeRef.current();
+      }
+      if (e.key !== 'Tab') return;
+      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), video[controls], iframe') || []);
+      if (controls.length === 0) return;
+      const first = controls[0]!;
+      const last = controls[controls.length - 1]!;
+      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
+        e.preventDefault();
+        last.focus();
+      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
+        e.preventDefault();
+        first.focus();
+      }
     };
-    window.addEventListener('keydown', handleKeyDown);
-    return () => window.removeEventListener('keydown', handleKeyDown);
-  }, [onClose]);
+    document.addEventListener('keydown', handleKeyDown);
+    return () => {
+      document.removeEventListener('keydown', handleKeyDown);
+      if (previouslyFocused?.isConnected) previouslyFocused.focus();
+    };
+  }, [media]);
 
   if (!media) return null;
 
   return (
     <div
       className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto"
+      ref={dialogRef}
       onClick={onClose}
-      role="presentation"
+      role="dialog"
+      aria-modal="true"
+      aria-label={media.name ? `Pré-visualização de ${media.name}` : "Pré-visualização de mídia"}
     >
       {/* Barra de Ações Superior */}
       <div
         className="absolute top-4 right-4 flex items-center gap-2 z-10"
@@ -36,15 +65,18 @@
           href={media.url}
           download={media.name || 'arquivo'}
           className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm shadow-md"
           title="Baixar arquivo"
+          aria-label={media.name ? `Baixar ${media.name}` : "Baixar arquivo"}
         >
           <DownloadSimple size={18} weight="bold" />
         </a>
 
         <button
           type="button"
+          ref={closeButtonRef}
           onClick={onClose}
+          aria-label="Fechar pré-visualização"
           className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-sm shadow-md"
           title="Fechar visualização (Esc)"
         >
           <X size={18} weight="bold" />
diff --git a/tests/uiux-phase15.test.ts b/tests/uiux-phase15.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/uiux-phase15.test.ts
@@ -0,0 +1,79 @@
+import test from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+
+const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
+
+test("F15/UI01: text submission is protected from double clicks and preserves newer draft", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /sendInFlightRef\.current = true/);
+  assert.match(code, /sendInFlightRef\.current = false/);
+  assert.match(code, /setText\(\(current\) => current\.trim\(\) === clean \? "" : current\)/);
+});
+
+test("F15/UI02: media send has try/catch/finally and guards concurrent sends", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /const sendMedia = async/);
+  assert.match(code, /if \(sendInFlightRef\.current\) return;/);
+  assert.match(code, /const ok = await onSendMessage\(payload\)/);
+  assert.match(code, /finally \{\s*sendInFlightRef\.current = false;\s*setIsSending\(false\)/);
+});
+
+test("F15/UI03: empty files are rejected and microphone denial gets feedback", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /file\.size === 0/);
+  assert.match(code, /Não foi possível acessar o microfone/);
+  assert.match(code, /audioStopInFlightRef\.current/);
+});
+
+test("F15/UI04: recorded filename extension aligns with MIME type", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /res\.blob\.type\.includes\("ogg"\)/);
+  assert.match(code, /res\.blob\.type\.includes\("mp4"\)/);
+  assert.match(code, /fileName: `audio-\$\{Date\.now\(\)\}\.\$\{extension\}`/);
+});
+
+test("F15/UI05: media preview has keyboard trap, ESC and focus restoration", () => {
+  const code = source("src/features/media/components/MediaPreviewModal.tsx");
+  assert.match(code, /role="dialog"/);
+  assert.match(code, /aria-modal="true"/);
+  assert.match(code, /e\.key === 'Escape'/);
+  assert.match(code, /e\.key !== 'Tab'/);
+  assert.match(code, /previouslyFocused\?\.isConnected/);
+});
+
+test("F15/UI06: import modal announces title, tabs and rejects large local files", () => {
+  const code = source("src/features/inbox/components/ImportExportModal.tsx");
+  assert.match(code, /aria-labelledby="import-export-dialog-title"/);
+  assert.match(code, /aria-pressed=\{tab === "import"\}/);
+  assert.match(code, /file\.size > 2 \* 1024 \* 1024/);
+  assert.match(code, /reader\.onerror/);
+});
+
+test("F15/UI07: mobile dock announces unread count once", () => {
+  const code = source("src/features/inbox/components/MobileDock.tsx");
+  assert.match(code, /aria-label=\{id === "inbox"/);
+  assert.match(code, /aria-hidden="true" className="mobile-dock-badge"/);
+});
+
+test("F15/UI08: QR and import dialogs restore focus and trap Tab", () => {
+  for (const path of ["src/features/instances/components/QrCodeDialog.tsx", "src/features/inbox/components/ImportExportModal.tsx"]) {
+    const code = source(path);
+    assert.match(code, /const previouslyFocused = document\.activeElement/);
+    assert.match(code, /event\.key !== "Tab"/);
+    assert.match(code, /dialogRef\.current\?\.querySelectorAll/);
+    assert.match(code, /previouslyFocused\?\.isConnected/);
+    assert.match(code, /ref=\{dialogRef\}/);
+  }
+});
+
+test("F15/UI09: QR dialog close action has a screen-reader label", () => {
+  assert.match(source("src/features/instances/components/QrCodeDialog.tsx"), /aria-label="Fechar conexão WhatsApp"/);
+});
+
+test("F15/UI10: import result announced and pasted contacts named", () => {
+  const code = source("src/features/inbox/components/ImportExportModal.tsx");
+  assert.match(code, /role="status" aria-live="polite"/);
+  assert.match(code, /aria-label="Contatos para importar em formato CSV ou JSON"/);
+});

```

## 13. PATCHES HISTÓRICOS COMPLETOS F11 → F14 (contexto integral, NÃO reaplicar)

Estes anexos existem para rastrear o que foi feito nas etapas anteriores. As linhas são registro histórico, **não** comprovação de que tudo foi compilado/homologado remotamente. O ZIP F15 **já contém o resultado agregado**.

### Histórico Fase 11

```diff
diff --git a/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md b/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
index 3329357..b506434 100644
--- a/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
+++ b/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
@@ -1,6 +1,6 @@
 # InboxOS — checklist de homologação e registro único de evidências
 
-**Base:** Hotfix Evolution de 02/10/2026. **Revisão Git:** __________________. **Staging ref:** __________________ (nunca informar secrets). **Responsável:** Antigravity + aprovação do dono.
+**Base:** ZIP `inboxos-antigravity-projeto-com-manual-npm-2026-10-02.zip` (original verificado em 11/10/2026). **Revisão Git:** pacote recebido sem `.git`; entrega desta fase é ZIP + patch independente. **Staging ref:** NÃO FORNECIDO (produção proibida como substituto). **Responsável:** execução local + homologação posterior isolada.
 
 Este documento **é a única fonte de status** durante a finalização no Antigravity. Status aceitos: `PASS` (evidência), `FAIL` (falha verificada), `BLOCKED` (impedimento externo), `NOT RUN` (ainda não executado). Não marcar PASS sem evidência da MESMA revisão.
 
@@ -13,31 +13,31 @@ Este documento **é a única fonte de status** durante a finalização no Antigr
 
 ## Gates e campos a preencher
 
-| Gate | Checagem objetiva | Status inicial | Evidência/comando/URL/log redigido |
+| Gate | Checagem objetiva | Status 11/10 | Evidência/comando/URL/log redigido |
 |---|---|---|---|
-| G0 | ZIP correto, git branch, Node/npm, secrets via env, Supabase staging diferente da produção | NOT RUN | |
-| G1.1 | Lockfile regenerado por npm oficial, diff revisado | BLOCKED | |
-| G1.2 | `npm ci --include=dev --include=optional` | BLOCKED | |
-| G1.3 | `npm test` da revisão final | NOT RUN | |
-| G1.4 | `npm run audit:release` | BLOCKED | |
-| G1.5 | `npm run lint` e `npx --no-install tsc --noEmit` | BLOCKED | |
-| G1.6 | `npm run build` + `npm run build:gated` | BLOCKED | |
-| G2.1 | Migrações em staging, sem conflito de histórico | NOT RUN | |
-| G2.2 | RLS 2 tenants, 2 instâncias e permissões servidor/cliente | NOT RUN | |
-| G2.3 | Concorrência do último owner/superadmin e rollback | NOT RUN | |
-| G2.4 | `onConflict` confere com UNIQUE/PK em staging | NOT RUN | |
-| G3.1 | Auth / OTP / convites / suspensão / sessions HTTP | NOT RUN | |
-| G3.2 | Webhook HTTP ingress, 400/401/413/429/503 e idempotência | NOT RUN | |
-| G3.3 | Efeitos persistidos por worker + recovery cron | NOT RUN | |
-| G3.4 | Outbox: 2 envios concorrentes, 408/5xx incertos e reconciliação | NOT RUN | |
-| G4.1 | Evolution v2 real apenas entre contas de teste | NOT RUN | |
-| G4.2 | Contatos, grupos, mídia, recibos, edição, remoção, reações | NOT RUN | |
-| G4.3 | Groq / Resend em sandbox, timeout e fluxo de erro | NOT RUN | |
-| G5.1 | Deploy Preview isolado, env e webhook seguros | NOT RUN | |
-| G5.2 | Smoke synthetic + persistência DB comprovada | NOT RUN | |
-| G5.3 | UI mobile/desktop, console, logs e alertas | NOT RUN | |
-| G5.4 | Rollback funcional e observabilidade da fila | NOT RUN | |
-| G6 | Checklist/backup/rollback + autorização de deploy e backfill separadas | BLOCKED | |
+| G0 | ZIP correto, git branch, Node/npm, secrets via env, Supabase staging diferente da produção | BLOCKED | PASS integridade ZIP e Node 22.16/npm 10.9.2; BLOCKED ref staging, env real e Git original ausentes. |
+| G1.1 | Lockfile regenerado por npm oficial, diff revisado | BLOCKED | 6 divergências originais reproduzidas; npm registry `EAI_AGAIN`, sem checksums inventados. |
+| G1.2 | `npm ci --include=dev --include=optional` | BLOCKED | Sem instalação npm por DNS/registry; nenhum node_modules no ZIP. |
+| G1.3 | `npm test` da revisão final | PASS | `npm test`: **189/189** (185 anteriores + 4 regressões novas, fixtures). |
+| G1.4 | `npm run audit:release` | FAIL | `npm run audit:release`: 268 arquivos TS, 83 rotas e Billing OFF PASS; integridade lock FAIL (6). |
+| G1.5 | `npm run lint` e `npx --no-install tsc --noEmit` | BLOCKED | Lint/tsc do projeto exigem node_modules; módulos puros novos passaram `tsc --noEmit` isolado. |
+| G1.6 | `npm run build` + `npm run build:gated` | BLOCKED | Sem dependências para Vite; `node scripts/netlify-build-gate.mjs --plan` exibiu gates esperados. |
+| G2.1 | Migrações em staging, sem conflito de histórico | BLOCKED | Sem staging; nenhum SQL executado. |
+| G2.2 | RLS 2 tenants, 2 instâncias e permissões servidor/cliente | BLOCKED | Sem staging; alterações locais são testes sintéticos, não validação RLS real. |
+| G2.3 | Concorrência do último owner/superadmin e rollback | BLOCKED | Sem staging; guardas de migração/concorrência não executadas. |
+| G2.4 | `onConflict` confere com UNIQUE/PK em staging | BLOCKED | Constraints reais e RPC ainda precisam confirmação; não executar ALTER em produção. |
+| G3.1 | Auth / OTP / convites / suspensão / sessions HTTP | BLOCKED | Sem servidor/identidades sintéticas para HTTP real. |
+| G3.2 | Webhook HTTP ingress, 400/401/413/429/503 e idempotência | BLOCKED | Suite offline passou, mas nenhum webhook E2E com DB. |
+| G3.3 | Efeitos persistidos por worker + recovery cron | BLOCKED | CAS de conclusão revisado; sem worker/DB de staging para verificar. |
+| G3.4 | Outbox: 2 envios concorrentes, 408/5xx incertos e reconciliação | BLOCKED | Outbox não testada contra Evolution sandbox. |
+| G4.1 | Evolution v2 real apenas entre contas de teste | BLOCKED | Evolution de teste não disponibilizada. |
+| G4.2 | Contatos, grupos, mídia, recibos, edição, remoção, reações | BLOCKED | Fixtures de grupos testadas; mídia/recibos E2E não testados. |
+| G4.3 | Groq / Resend em sandbox, timeout e fluxo de erro | BLOCKED | Groq/Resend sandbox não configurados. |
+| G5.1 | Deploy Preview isolado, env e webhook seguros | BLOCKED | Nenhum Deploy Preview publicado. |
+| G5.2 | Smoke synthetic + persistência DB comprovada | BLOCKED | Sem staging isolado. |
+| G5.3 | UI mobile/desktop, console, logs e alertas | BLOCKED | Sem aplicação compilada e publicada para UI manual. |
+| G5.4 | Rollback funcional e observabilidade da fila | BLOCKED | Sem staging para validar rollback e indicadores reais. |
+| G6 | Checklist/backup/rollback + autorização de deploy e backfill separadas | BLOCKED | Produção NO-GO: gates G1, G2–G5 sem comprovação. |
 
 ## Testes Evolution (E01–E22)
 Registrar detalhamento no `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`. Resumo: E01–E22 `NOT RUN` em ambiente real até que sejam executados na mesma revisão. Os mocks locais preexistentes não mudam este status.
@@ -72,3 +72,35 @@ Registrar detalhamento no `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`. Resumo: E01–
 - **Autorização explícita do dono para deploy de produção:** pendente — não inferir.
 - **Autorização distinta do dono para reprocessamento seletivo de backlog:** pendente — não inferir.
 - Decisão final: `GO / NO-GO` e justificativa: __________.
+
+## Rodada de correções da Fase 11 — 11/10/2026 (offline)
+
+**Escopo:** alterações no código-fonte do ZIP informado; nenhuma conexão Supabase, Evolution, Netlify ou deploy. O ZIP base não continha diretório `.git`, `.env` real nem `node_modules`.
+
+### Alterações + causas + regressões avaliadas
+
+1. **Cache de grupo não isolado:** `src/lib/evolution.server.ts` usava `Map` global indexado só por grupo, contaminando sujeito/permissão entre workspaces e entre duas instâncias no mesmo workspace. Criado `src/server/evolution/group-metadata-cache.ts` com chave `workspace_id + instance_name + group_id`, e alterados TODOS os chamadores (webhook, sync-engine, mensagens, persistência). Risco: chamada antiga sem escopo; mitigação: assinaturas exigem os três campos, auditoria de imports/rotas e fixtures com mesmo JID em 3 escopos. **PASS regressão local, E2E BLOCKED.**
+2. **Permissão indevida em `GROUP_PARTICIPANTS_UPDATE`:** eventos `add` da própria conta antes marcavam `can_send=false` mesmo em grupo aberto; ações desconhecidas também rebaixavam permissões. Criado `permissionsAfterOwnGroupParticipantUpdate`; atualização apenas em ações conhecidas, com resultado coerente com anúncio/restrição, e propagação de erros do banco. Risco: permissões refletirem grupo defasado durante concorrência; validar com Evolution sandbox e DB em staging. **PASS fixture, E2E BLOCKED.**
+3. **Falha de DB tratada como processamento concluído:** verificados erros de leitura/escrita no webhook para instância, status de conexão, QR, grupos, participante e exclusão de chat; antes operações ignoravam os erros e retornavam 200. Agora propagam exceção, permitindo `failed/dead_letter` em vez de falso sucesso. Risco: volume de retries cresce durante indisponibilidade do DB, mas não silenciosamente perde eventos. **PASS regressão estática, E2E BLOCKED.**
+4. **Finalização da fila não comprovada:** `consumeEvolutionQueueMessage` atualizava status `completed` sem exigir retorno da linha reivindicada; dead-letter por tentativas ignorava erro de escrita; falha ao persistir última tentativa podia ser engolida. Agora CAS de conclusão usa `.select('id').maybeSingle()` com verificação, e falhas do DB são propagadas. Risco: mais retries de falhas legítimas e workers concorrentes; confirmar idempotência/recovery em staging. **PASS testes offline, E2E BLOCKED.**
+5. **Cache de permissões stale:** mudança apenas de `announce` ou `isAdmin` recalcula `canSend`; grupo só muda cache após operação de DB com sucesso. Risco de metadata incompleta deve ser verificado em `GROUPS_UPDATE` e `GROUPS_UPSERT` de instância sandbox. **PASS fixtures locais, E2E BLOCKED.**
+
+### Comandos / evidências executados
+
+- `unzip`/`ZipFile.testzip()` — **PASS**, 536 entradas na origem, nenhuma inválida.
+- `node -v` → **v22.16.0**; `npm -v` → **10.9.2**.
+- `npm test` inicial → **185/185 PASS**; final → **189/189 PASS** após anexar 4 testes a `package.json`.
+- `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions` nos novos módulos puros + contact-identity → **PASS**. Não equivale ao typecheck do projeto.
+- `npm run audit:release` → **FAIL somente integrity do lock**: 6 inconsistências originais; **PASS** parse 268 TS/TSX/MTS, imports locais, 83 rotas, Billing OFF.
+- `npm ping --fetch-timeout=12000 --fetch-retries=0` → **BLOCKED EAI_AGAIN**. `npm ci`, ESLint, typecheck global, Vite e build:gated não executados sem dependências.
+- `node scripts/netlify-build-gate.mjs --plan` → gates: unit-and-regression, release-preflight, eslint, typescript, vite-netlify-build.
+- **Outros scripts de manutenção, migrations, backfills, webhook remoto e deploy:** NOT RUN.
+
+### Riscos estruturais encontrados — não corrigir cegamente sem staging
+
+- `supabase/migrations/20260906155548_add_messages_unique_constraint.sql` define `messages_workspace_external_key (workspace_id,external_id)`; `persist_inbox_message` em `20260917210000_reconcile_inbox_architecture.sql` também consulta por workspace+external_id. Duas instâncias **no mesmo workspace** potencialmente compartilham ids externos e podem se deduplicar incorretamente. **Exige plano versionado de migração, verificação de dados/constraints vivos e teste concorrente em staging**; não foi alterado o schema.
+- A fila real fotografada em 02/10 tinha backlog severo; números são históricos. **NÃO reprocessar eventos antigos sem autorização separada.**
+
+### Release
+
+**NO-GO**. Código modificado validado somente por suite offline. Pré-requisitos: npm registry, lockfile regenerado por npm e gates G1.2-G1.6 PASS, banco/instância Evolution de staging isolados, testes HTTP e preview. Billing permanece OFF.
diff --git a/package.json b/package.json
index 023bc01..3ac59de 100644
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
diff --git a/src/lib/evolution.server.ts b/src/lib/evolution.server.ts
index 0d2e108..ce6d266 100644
--- a/src/lib/evolution.server.ts
+++ b/src/lib/evolution.server.ts
@@ -491,58 +491,10 @@ export function getActivePresences(): Record<string, "composing" | "recording">
   return active;
 }
 
-// Store em memória de permissões e metadados de grupos em tempo real
-export interface GroupMetadataState {
-  id: string; // group phone digits
-  announce: boolean; // true = apenas admins podem enviar mensagens
-  restrict?: boolean;
-  isAdmin?: boolean;
-  canSend: boolean;
-  subject?: string | null;
-  desc?: string | null;
-  updatedAt: number;
-}
-
-const groupMetadataCache = new Map<string, GroupMetadataState>();
-
-export function recordGroupMetadata(
-  groupId: string,
-  metadata: Partial<GroupMetadataState>,
-): GroupMetadataState | null {
-  const cleanId = cleanPhone(groupId);
-  if (!cleanId) return null;
-  const existing = groupMetadataCache.get(cleanId);
-  const announce =
-    metadata.announce !== undefined ? metadata.announce : (existing?.announce ?? false);
-  const isAdmin = metadata.isAdmin !== undefined ? metadata.isAdmin : (existing?.isAdmin ?? false);
-  const canSend = metadata.canSend !== undefined ? metadata.canSend : announce ? isAdmin : true;
-
-  const updated: GroupMetadataState = {
-    id: cleanId,
-    announce,
-    restrict: metadata.restrict !== undefined ? metadata.restrict : (existing?.restrict ?? false),
-    isAdmin,
-    canSend,
-    subject: metadata.subject !== undefined ? metadata.subject : (existing?.subject ?? null),
-    desc: metadata.desc !== undefined ? metadata.desc : (existing?.desc ?? null),
-    updatedAt: Date.now(),
-  };
-  groupMetadataCache.set(cleanId, updated);
-  return updated;
-}
-
-export function getGroupMetadata(groupId: string): GroupMetadataState | null {
-  const cleanId = cleanPhone(groupId);
-  return groupMetadataCache.get(cleanId) ?? null;
-}
-
-export function getAllGroupMetadata(): Record<string, GroupMetadataState> {
-  const result: Record<string, GroupMetadataState> = {};
-  for (const [id, state] of groupMetadataCache.entries()) {
-    result[id] = state;
-  }
-  return result;
-}
+// Group metadata is scoped per tenant/instance (see group-metadata-cache.ts).
+export { recordGroupMetadata, getGroupMetadata, getAllGroupMetadata } from "@/server/evolution/group-metadata-cache";
+export type { GroupMetadataState } from "@/server/evolution/group-metadata-cache";
+import { recordGroupMetadata, getGroupMetadata } from "@/server/evolution/group-metadata-cache";
 
 /**
  * Consulta nome salvo do contato na tabela de chats para manter consistência de agenda.
@@ -582,6 +534,7 @@ export async function resolveContactSavedName(
  * Busca ativamente informações oficiais de um grupo na Evolution API (assunto, foto, permissões).
  */
 export async function fetchGroupInfo(
+  workspaceId: string,
   instanceName: string,
   groupIdOrJid: string,
 ): Promise<{
@@ -623,7 +576,7 @@ export async function fetchGroupInfo(
         // Alguns contatos e grupos não expõem foto pela Evolution API.
       }
 
-      const recorded = recordGroupMetadata(cleanId, {
+      const recorded = recordGroupMetadata(workspaceId, instanceName, cleanId, {
         announce,
         restrict,
         subject,
@@ -826,7 +779,7 @@ export async function persistMessage(input: UpsertMessageInput) {
   const chatId = existing?.id ?? null;
   let resolvedProfilePicture = input.profilePicUrl || storedContact?.profile_pic_url || null;
 
-  const groupMeta = input.isGroup ? getGroupMetadata(phone) : null;
+  const groupMeta = input.isGroup ? getGroupMetadata(wsId, input.instanceName, phone) : null;
 
   // Prioridade de nome para contatos: 1. Nome salvo na agenda do celular (saved_name) | 2. Nome de grupo oficial (groupMeta.subject) | 3. Nome de perfil (push_name)
   let resolvedName: string | null = null;
@@ -851,7 +804,7 @@ export async function persistMessage(input: UpsertMessageInput) {
     // Se o nome estiver genérico ou corrompido, confirma o assunto oficial antes
     // de responder ao webhook. Tarefas soltas podem ser encerradas pelo Worker.
     if (resolvedName === "Grupo WhatsApp" || isSenderName || !existingGroupValid) {
-      const info = await fetchGroupInfo(input.instanceName, phone);
+      const info = await fetchGroupInfo(wsId, input.instanceName, phone);
       if (info?.subject && info.subject !== "Grupo WhatsApp") resolvedName = info.subject;
       if (info?.picture) resolvedProfilePicture = info.picture;
     }
diff --git a/src/routes/api/messages/send.ts b/src/routes/api/messages/send.ts
index 934ad11..8867e13 100644
--- a/src/routes/api/messages/send.ts
+++ b/src/routes/api/messages/send.ts
@@ -344,7 +344,7 @@ export const Route = createFileRoute("/api/messages/send")({
             errStr.includes("403");
 
           if (isGroup && isAdminBlocked) {
-            recordGroupMetadata(phone, { announce: true, canSend: false });
+            recordGroupMetadata(auth.workspaceId, instanceName, phone, { announce: true, canSend: false });
             return json(
               {
                 success: false,
diff --git a/src/routes/api/public/webhooks/evolution.ts b/src/routes/api/public/webhooks/evolution.ts
index 7f7bb7d..d15cc7d 100644
--- a/src/routes/api/public/webhooks/evolution.ts
+++ b/src/routes/api/public/webhooks/evolution.ts
@@ -48,6 +48,7 @@ import { verifyEvolutionQueueConsumerRequest } from "@/server/evolution/backgrou
 import { trustedAppOrigin } from "@/server/security/trusted-app-origin";
 import { readEvolutionWebhookBody, EvolutionWebhookBodyTooLarge } from "@/server/evolution/webhook-body";
 import { maybeRunAutomaticAgent } from "@/server/product/workspace-product.server";
+import { permissionsAfterOwnGroupParticipantUpdate } from "@/server/evolution/group-participant-permissions";
 
 export const Route = createFileRoute("/api/public/webhooks/evolution")({
   server: {
@@ -97,11 +98,13 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
         try {
           const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
 
-          const { data: instRow } = await supabaseAdmin
+          const { data: instRow, error: instanceLookupError } = await supabaseAdmin
             .from("whatsapp_instances")
             .select("id, workspace_id, status")
             .eq("instance_name", instanceName)
             .maybeSingle();
+          // DB outages are not unknown instances: retry instead of dropping events as 404.
+          if (instanceLookupError) throw instanceLookupError;
 
           const workspaceId = instRow?.workspace_id;
           if (!workspaceId) {
@@ -172,16 +175,17 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
               event === "CONNECTION_UPDATE")
           ) {
             // Garante que o banco registra a instância como aberta
-            await supabaseAdmin
+            const { error: instanceStatusError } = await supabaseAdmin
               .from("whatsapp_instances")
               .update({ status: "open", updated_at: new Date().toISOString() })
               .eq("workspace_id", workspaceId)
               .eq("instance_name", instanceName);
+            if (instanceStatusError) throw instanceStatusError;
           }
 
           if (event === "CONNECTION_UPDATE") {
             const state = data?.state ?? data?.connection;
-            await supabaseAdmin.from("whatsapp_instances").upsert(
+            const { error: connectionError } = await supabaseAdmin.from("whatsapp_instances").upsert(
               {
                 workspace_id: workspaceId,
                 instance_name: instanceName,
@@ -190,6 +194,7 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
               },
               { onConflict: "workspace_id,instance_name" },
             );
+            if (connectionError) throw connectionError;
 
             if (state === "open") {
               // Auto-cura de webhooks: reconfirma as assinaturas do evento de webhook da Evolution API
@@ -240,7 +245,7 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
 
           if (event === "QRCODE_UPDATED") {
             const qr = data?.qrcode?.base64 ?? data?.qrcode?.code ?? data?.base64 ?? null;
-            await supabaseAdmin.from("whatsapp_instances").upsert(
+            const { error: qrError } = await supabaseAdmin.from("whatsapp_instances").upsert(
               {
                 workspace_id: workspaceId,
                 instance_name: instanceName,
@@ -249,6 +254,7 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
               },
               { onConflict: "workspace_id,instance_name" },
             );
+            if (qrError) throw qrError;
             return json({ ok: true });
           }
 
@@ -353,23 +359,17 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
               const subject = data?.subject || data?.name || null;
               const desc = data?.desc || data?.description || null;
 
-              recordGroupMetadata(groupId, {
-                ...(announce !== undefined ? { announce } : {}),
-                ...(restrict !== undefined ? { restrict } : {}),
-                ...(subject ? { subject } : {}),
-                ...(desc ? { desc } : {}),
-              });
-
               const patch: any = {};
               if (subject) patch.name = subject;
               if (announce !== undefined) {
-                const { data: currentGroup } = await supabaseAdmin
+                const { data: currentGroup, error: currentGroupError } = await supabaseAdmin
                   .from("chats")
                   .select("is_admin")
                   .eq("workspace_id", workspaceId)
                   .eq("instance_name", instanceName)
                   .eq("phone", groupId)
                   .maybeSingle();
+                if (currentGroupError) throw currentGroupError;
                 patch.is_announcement = announce;
                 patch.can_send = announce ? Boolean(currentGroup?.is_admin) : true;
               }
@@ -377,13 +377,20 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
                 patch.group_metadata = { description: desc, restrict };
               }
               if (Object.keys(patch).length > 0) {
-                await supabaseAdmin
+                const { error: groupUpdateError } = await supabaseAdmin
                   .from("chats")
                   .update(patch)
                   .eq("workspace_id", workspaceId)
                   .eq("instance_name", instanceName)
                   .eq("phone", groupId);
+                if (groupUpdateError) throw groupUpdateError;
               }
+              recordGroupMetadata(workspaceId, instanceName, groupId, {
+                ...(announce !== undefined ? { announce } : {}),
+                ...(restrict !== undefined ? { restrict } : {}),
+                ...(subject ? { subject } : {}),
+                ...(desc ? { desc } : {}),
+              });
             }
             return json({ ok: true });
           }
@@ -418,15 +425,6 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
                 String(myParticipant?.admin || myParticipant?.role || "").toLowerCase(),
               );
 
-              recordGroupMetadata(groupId, {
-                announce,
-                restrict,
-                ...(subject ? { subject } : {}),
-                desc,
-                isAdmin,
-                canSend: !announce || isAdmin,
-              });
-
               const { error: groupUpsertError } = await supabaseAdmin.from("chats").upsert(
                 {
                   workspace_id: workspaceId,
@@ -446,14 +444,23 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
                 { onConflict: "workspace_id,instance_name,phone" },
               );
               if (groupUpsertError) throw groupUpsertError;
+              recordGroupMetadata(workspaceId, instanceName, groupId, {
+                announce,
+                restrict,
+                ...(subject ? { subject } : {}),
+                desc,
+                isAdmin,
+                canSend: !announce || isAdmin,
+              });
 
-              const { data: chat } = await supabaseAdmin
+              const { data: chat, error: groupChatLookupError } = await supabaseAdmin
                 .from("chats")
                 .select("id")
                 .eq("workspace_id", workspaceId)
                 .eq("instance_name", instanceName)
                 .eq("phone", groupId)
                 .single();
+              if (groupChatLookupError) throw groupChatLookupError;
               if (chat && participants.length > 0) {
                 const { error: groupParticipantsError } = await supabaseAdmin.from("group_participants").upsert(
                   participants
@@ -506,13 +513,14 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
                   String(participant?.id || participant?.jid || participant || ""),
                 )
                 .filter(Boolean);
-              const { data: groupChat } = await supabaseAdmin
+              const { data: groupChat, error: groupChatError } = await supabaseAdmin
                 .from("chats")
                 .select("id,is_announcement")
                 .eq("workspace_id", workspaceId)
                 .eq("instance_name", instanceName)
                 .eq("phone", groupId)
                 .maybeSingle();
+              if (groupChatError) throw groupChatError;
               if (groupChat && participantJids.length > 0) {
                 if (action === "remove") {
                   const { error: removeError } = await supabaseAdmin
@@ -539,25 +547,20 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
 
               const affectedMe =
                 myPhone && participantJids.some((jid: string) => cleanPhone(jid) === myPhone);
-              if (affectedMe) {
-                let isAdmin = false;
-                let canSend = false;
-                if (action === "promote") {
-                  isAdmin = true;
-                  canSend = true;
-                  recordGroupMetadata(groupId, { isAdmin: true, canSend: true });
-                } else if (action === "demote") {
-                  canSend = !groupChat?.is_announcement;
-                  recordGroupMetadata(groupId, { isAdmin: false, canSend });
-                } else if (action === "remove") {
-                  recordGroupMetadata(groupId, { isAdmin: false, canSend: false });
+              if (affectedMe && groupChat) {
+                const permissions = permissionsAfterOwnGroupParticipantUpdate(
+                  action, Boolean(groupChat.is_announcement),
+                );
+                if (permissions) {
+                  const { error: ownPermissionsError } = await supabaseAdmin
+                    .from("chats")
+                    .update({ is_admin: permissions.isAdmin, can_send: permissions.canSend })
+                    .eq("workspace_id", workspaceId)
+                    .eq("instance_name", instanceName)
+                    .eq("phone", groupId);
+                  if (ownPermissionsError) throw ownPermissionsError;
+                  recordGroupMetadata(workspaceId, instanceName, groupId, permissions);
                 }
-                await supabaseAdmin
-                  .from("chats")
-                  .update({ is_admin: isAdmin, can_send: canSend })
-                  .eq("workspace_id", workspaceId)
-                  .eq("instance_name", instanceName)
-                  .eq("phone", groupId);
               }
             }
             return json({ ok: true });
@@ -591,6 +594,7 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
                 .eq("workspace_id", workspaceId)
                 .eq("instance_name", instanceName)
                 .eq("phone", phone);
+              if (archiveError) throw archiveError;
             }
             return json({ ok: true });
           }
@@ -884,7 +888,7 @@ export const Route = createFileRoute("/api/public/webhooks/evolution")({
 
             const quoted = extractQuotedMessage(message, item);
 
-            const groupMeta = isGroup ? getGroupMetadata(phone) : null;
+            const groupMeta = isGroup ? getGroupMetadata(workspaceId, instanceName, phone) : null;
             const chatName = isGroup
               ? (groupMeta?.subject ?? null)
               : fromMe
diff --git a/src/server/evolution/event-inbox.ts b/src/server/evolution/event-inbox.ts
index ad34a9b..8235ba4 100644
--- a/src/server/evolution/event-inbox.ts
+++ b/src/server/evolution/event-inbox.ts
@@ -41,7 +41,7 @@ export async function consumeEvolutionQueueMessage(
   // A Worker pode ser interrompida por limite de CPU/subrequisições antes de
   // registrar a falha. A entrega seguinte encerra um trabalho já esgotado.
   if (event.attempts >= MAX_QUEUE_ATTEMPTS) {
-    await supabaseAdmin
+    const { error: exhaustedError } = await supabaseAdmin
       .from("evolution_events")
       .update({
         status: "dead_letter",
@@ -51,6 +51,7 @@ export async function consumeEvolutionQueueMessage(
       .eq("id", event.id)
       .eq("status", event.status)
       .eq("attempts", event.attempts);
+    if (exhaustedError) throw exhaustedError;
     return;
   }
 
@@ -221,7 +222,7 @@ export async function consumeEvolutionQueueMessage(
     }
   }
 
-  const { error: completionError } = await supabaseAdmin
+  const { data: completion, error: completionError } = await supabaseAdmin
     .from("evolution_events")
     .update({
       status: "completed",
@@ -231,8 +232,11 @@ export async function consumeEvolutionQueueMessage(
     })
     .eq("id", event.id)
     .eq("status", "processing")
-    .eq("attempts", nextAttempts);
+    .eq("attempts", nextAttempts)
+    .select("id")
+    .maybeSingle();
   if (completionError) throw completionError;
+  if (!completion) throw new Error("Evolution completion CAS lost ownership");
   } catch (processingError) {
     // A queue failure (including configuration/network failures) must not
     // leave this event labelled 'processing' indefinitely. Do not overwrite
@@ -248,7 +252,10 @@ export async function consumeEvolutionQueueMessage(
       .eq("id", event.id)
       .eq("status", "processing")
       .eq("attempts", nextAttempts);
-    if (failureError) console.error("[evolution-worker] could not persist failure", failureError.message);
+    if (failureError) {
+      console.error("[evolution-worker] could not persist failure", failureError.message);
+      throw failureError; // Never ACK exhaustion when the DB write failed.
+    }
     if (!exhausted) throw processingError;
   }
 }
diff --git a/src/server/evolution/group-metadata-cache.ts b/src/server/evolution/group-metadata-cache.ts
new file mode 100644
index 0000000..938d1c0
--- /dev/null
+++ b/src/server/evolution/group-metadata-cache.ts
@@ -0,0 +1,75 @@
+/** Short-lived in-process metadata for a *specific* workspace AND WhatsApp instance.
+ * Never key by group JID alone: the same group may be connected by customers
+ * in different workspaces, with different account permissions.
+ */
+import { scopedIdentityKey } from "./contact-identity.ts";
+
+export interface GroupMetadataState {
+  id: string;
+  announce: boolean;
+  restrict?: boolean;
+  isAdmin?: boolean;
+  canSend: boolean;
+  subject?: string | null;
+  desc?: string | null;
+  updatedAt: number;
+}
+
+const groupMetadataCache = new Map<string, GroupMetadataState>();
+
+function cleanGroupId(groupId: string): string {
+  return String(groupId).split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
+}
+
+function groupKey(workspaceId: string, instanceName: string, groupId: string): string | null {
+  if (!workspaceId.trim() || !instanceName.trim()) return null;
+  const id = cleanGroupId(groupId);
+  return id ? scopedIdentityKey(workspaceId, instanceName, id) : null;
+}
+
+export function recordGroupMetadata(
+  workspaceId: string, instanceName: string, groupId: string,
+  metadata: Partial<GroupMetadataState>,
+): GroupMetadataState | null {
+  const key = groupKey(workspaceId, instanceName, groupId);
+  if (!key) return null;
+  const id = cleanGroupId(groupId);
+  const existing = groupMetadataCache.get(key);
+  const announce = metadata.announce !== undefined ? metadata.announce : (existing?.announce ?? false);
+  const isAdmin = metadata.isAdmin !== undefined ? metadata.isAdmin : (existing?.isAdmin ?? false);
+  // A change to announce/admin invalidates cached send privileges even if
+  // the webhook omits canSend; preserving the old value grants stale access.
+  const permissionChanged = metadata.announce !== undefined || metadata.isAdmin !== undefined;
+  const canSend = metadata.canSend !== undefined
+    ? metadata.canSend
+    : permissionChanged ? (!announce || isAdmin) : (existing?.canSend ?? (!announce || isAdmin));
+  const updated: GroupMetadataState = {
+    id, announce,
+    restrict: metadata.restrict !== undefined ? metadata.restrict : (existing?.restrict ?? false),
+    isAdmin, canSend,
+    subject: metadata.subject !== undefined ? metadata.subject : (existing?.subject ?? null),
+    desc: metadata.desc !== undefined ? metadata.desc : (existing?.desc ?? null),
+    updatedAt: Date.now(),
+  };
+  groupMetadataCache.set(key, updated);
+  return updated;
+}
+
+export function getGroupMetadata(
+  workspaceId: string, instanceName: string, groupId: string,
+): GroupMetadataState | null {
+  const key = groupKey(workspaceId, instanceName, groupId);
+  return key ? (groupMetadataCache.get(key) ?? null) : null;
+}
+
+export function getAllGroupMetadata(
+  workspaceId: string, instanceName: string,
+): Record<string, GroupMetadataState> {
+  const prefix = scopedIdentityKey(workspaceId, instanceName, "");
+  const result: Record<string, GroupMetadataState> = {};
+  if (!workspaceId.trim() || !instanceName.trim()) return result;
+  for (const [key, state] of groupMetadataCache) {
+    if (key.startsWith(prefix)) result[state.id] = state;
+  }
+  return result;
+}
diff --git a/src/server/evolution/group-participant-permissions.ts b/src/server/evolution/group-participant-permissions.ts
new file mode 100644
index 0000000..3615e74
--- /dev/null
+++ b/src/server/evolution/group-participant-permissions.ts
@@ -0,0 +1,14 @@
+/** A participant event must not turn an ordinary group member into a
+ * read-only account. Unknown actions must not mutate cached permissions.
+ */
+export function permissionsAfterOwnGroupParticipantUpdate(
+  action: string, isAnnouncement: boolean,
+): { isAdmin: boolean; canSend: boolean } | null {
+  switch (action.toLowerCase()) {
+    case "promote": return { isAdmin: true, canSend: true };
+    case "demote":
+    case "add": return { isAdmin: false, canSend: !isAnnouncement };
+    case "remove": return { isAdmin: false, canSend: false };
+    default: return null;
+  }
+}
diff --git a/src/server/evolution/sync-engine.ts b/src/server/evolution/sync-engine.ts
index 19d0c8d..ffd8a5a 100644
--- a/src/server/evolution/sync-engine.ts
+++ b/src/server/evolution/sync-engine.ts
@@ -216,7 +216,7 @@ export async function syncRecentMessages(
         const gPhone = cleanPhone(gJid);
         const gSubject = String(g.subject || g.name || "").trim();
         if (gPhone && gSubject) {
-          recordGroupMetadata(gPhone, {
+          recordGroupMetadata(workspaceId, instanceName, gPhone, {
             subject: gSubject,
             desc: g.desc || g.description || null,
             announce: Boolean(g.announce),
@@ -432,7 +432,7 @@ export async function syncRecentMessages(
 
       // NUNCA usar safePush (pushName do membro) para nomear um grupo do WhatsApp!
       const groupSubject = isGroup
-        ? getGroupMetadata(phone)?.subject ||
+        ? getGroupMetadata(workspaceId, instanceName, phone)?.subject ||
           contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, phone)) ||
           "Grupo WhatsApp"
         : null;
@@ -500,7 +500,7 @@ export async function syncRecentMessages(
     // Corrige e atualiza o nome oficial do grupo ou contato na tabela chats se estiver genérico ou cru
     if (isGroup && chat) {
       const officialSubject =
-        getGroupMetadata(phone)?.subject ||
+        getGroupMetadata(workspaceId, instanceName, phone)?.subject ||
         contactNameCache.get(scopedIdentityKey(workspaceId, instanceName, phone));
       if (officialSubject && (!chat.name || chat.name === "Grupo WhatsApp" || chat.name !== officialSubject)) {
         await supabaseAdmin
@@ -841,7 +841,7 @@ export async function syncGroups(
     const canSend = announce ? isAdmin : true;
 
     // Registra no cache de permissões em tempo real
-    recordGroupMetadata(groupId, {
+    recordGroupMetadata(workspaceId, instanceName, groupId, {
       announce,
       restrict,
       isAdmin,
@@ -890,7 +890,7 @@ export async function syncGroups(
         ? isAdmin
         : Boolean(existingChat?.can_send)
       : true;
-    recordGroupMetadata(groupId, {
+    recordGroupMetadata(workspaceId, instanceName, groupId, {
       announce,
       restrict,
       isAdmin,
@@ -1231,7 +1231,7 @@ export async function syncGroupParticipants(
     .eq("workspace_id", workspaceId);
   if (chatError) return { success: false, error: chatError.message, count: 0 };
 
-  recordGroupMetadata(groupId, {
+  recordGroupMetadata(workspaceId, instanceName, groupId, {
     announce: effectiveAnnounce,
     restrict: effectiveRestrict,
     isAdmin,
diff --git a/tests/evolution-multitenant-group.test.ts b/tests/evolution-multitenant-group.test.ts
new file mode 100644
index 0000000..6667c7a
--- /dev/null
+++ b/tests/evolution-multitenant-group.test.ts
@@ -0,0 +1,66 @@
+/** Offline regressions for group metadata and persistence acknowledgement.
+ * These tests use synthetic fixtures; they do not call Supabase/Evolution.
+ */
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { readFileSync } from 'node:fs';
+import { recordGroupMetadata, getGroupMetadata, getAllGroupMetadata } from '../src/server/evolution/group-metadata-cache.ts';
+import { permissionsAfterOwnGroupParticipantUpdate } from '../src/server/evolution/group-participant-permissions.ts';
+
+const ID = '120363000000@g.us';
+test('same group JID cannot share metadata across different workspaces or instances', () => {
+  recordGroupMetadata('ws-A','inst-1',ID,{ subject:'Grupo da empresa A', announce:true, isAdmin:false, canSend:false });
+  recordGroupMetadata('ws-B','inst-1',ID,{ subject:'Grupo da empresa B', announce:false, isAdmin:true, canSend:true });
+  recordGroupMetadata('ws-A','inst-2',ID,{ subject:'Segunda conexão', announce:false, canSend:true });
+  assert.equal(getGroupMetadata('ws-A','inst-1',ID)?.subject,'Grupo da empresa A');
+  assert.equal(getGroupMetadata('ws-A','inst-1',ID)?.canSend,false);
+  assert.equal(getGroupMetadata('ws-B','inst-1',ID)?.subject,'Grupo da empresa B');
+  assert.equal(getGroupMetadata('ws-A','inst-2',ID)?.subject,'Segunda conexão');
+  recordGroupMetadata('ws-B','inst-1',ID,{ subject:'Atualizado apenas para B' });
+  assert.equal(getGroupMetadata('ws-A','inst-1',ID)?.subject,'Grupo da empresa A');
+  assert.equal(getGroupMetadata('ws-B','inst-1',ID)?.subject,'Atualizado apenas para B');
+  assert.equal(getGroupMetadata('ws-C','inst-1',ID),null);
+  assert.equal(getGroupMetadata('','inst-1',ID),null);
+  assert.equal(getGroupMetadata('ws-A','',ID),null);
+  assert.equal(recordGroupMetadata('ws-A','',ID,{subject:'Never write'}),null);
+  assert.deepEqual(Object.keys(getAllGroupMetadata('ws-A','inst-1')),['120363000000']);
+  assert.deepEqual(getAllGroupMetadata('ws-C','inst-1'),{});
+});
+
+test('partial group metadata updates preserve earlier title and permissions within their scope', () => {
+  recordGroupMetadata('ws-A','inst-1',ID,{ restrict:true, desc:'Descrição nova' });
+  const a = getGroupMetadata('ws-A','inst-1',ID);
+  assert.equal(a?.subject,'Grupo da empresa A');
+  assert.equal(a?.canSend,false);
+  assert.equal(a?.desc,'Descrição nova');
+  assert.equal(getGroupMetadata('ws-B','inst-1',ID)?.desc,null);
+  // Announcement restrictions change without a separate canSend payload.
+  recordGroupMetadata('ws-A','inst-2',ID,{announce:true,isAdmin:false});
+  assert.equal(getGroupMetadata('ws-A','inst-2',ID)?.canSend,false);
+  recordGroupMetadata('ws-A','inst-2',ID,{announce:false});
+  assert.equal(getGroupMetadata('ws-A','inst-2',ID)?.canSend,true);
+});
+
+test('group participant add and demote permit normal member to send unless announce-only', () => {
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('add',false),{isAdmin:false,canSend:true});
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('add',true),{isAdmin:false,canSend:false});
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('promote',true),{isAdmin:true,canSend:true});
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('demote',false),{isAdmin:false,canSend:true});
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('demote',true),{isAdmin:false,canSend:false});
+  assert.deepEqual(permissionsAfterOwnGroupParticipantUpdate('remove',false),{isAdmin:false,canSend:false});
+  assert.equal(permissionsAfterOwnGroupParticipantUpdate('unknown',false),null);
+});
+
+test('Evolution write errors are not silently acknowledged as success', () => {
+  const route = readFileSync(new URL('../src/routes/api/public/webhooks/evolution.ts',import.meta.url),'utf8');
+  for (const error of ['instanceLookupError','currentGroupError','connectionError','qrError','groupUpdateError','archiveError','ownPermissionsError','groupChatError','groupChatLookupError']) {
+    assert.match(route, new RegExp(`if \\(\\b${error}\\b\\) throw ${error};`), `Missing propagation of ${error}`);
+  }
+  assert.match(route,/permissionsAfterOwnGroupParticipantUpdate\(/);
+  assert.match(route,/recordGroupMetadata\(workspaceId, instanceName, groupId, permissions\)/);
+  const worker = readFileSync(new URL('../src/server/evolution/event-inbox.ts',import.meta.url),'utf8');
+  assert.match(worker,/\.eq\("status", "processing"\)\s*\.eq\("attempts", nextAttempts\)\s*\.select\("id"\)\s*\.maybeSingle\(\)/);
+  assert.match(worker,/if \(!completion\) throw new Error\("Evolution completion CAS lost ownership"\)/);
+  assert.match(worker,/if \(exhaustedError\) throw exhaustedError/);
+  assert.match(worker,/if \(failureError\) \{/);
+});

```

### Histórico Fase 12

```diff
diff --git a/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md b/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
--- a/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
+++ b/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
@@ -104,3 +104,14 @@
 ### Release
 
 **NO-GO**. Código modificado validado somente por suite offline. Pré-requisitos: npm registry, lockfile regenerado por npm e gates G1.2-G1.6 PASS, banco/instância Evolution de staging isolados, testes HTTP e preview. Billing permanece OFF.
+
+## Fase 12 · Rodada 2 — Escopo obrigatório e auditoria offline (11/10/2026)
+
+- **G0-02 PASS por snapshot ZIP + SHA256**, diretório de trabalho isolado; não há `.git` na origem, logo ainda não foi criado commit/branch no Git remoto. SHA256 e instruções em `docs/FASE12_SNAPSHOT_BASE_SHA256.md`.
+- **G1-03 PASS 195/195** (`npm test`), agora com seis casos novos. **G1-04 FAIL**: auditoria estática com 269 arquivos TS/TSX/MTS sem erros de sintaxe, 83 rotas, imports locais OK e Billing guardado; **persistem exatamente seis divergências no lockfile**.
+- **G1-01 e G1-02 BLOCKED/FAIL:** registro npm inacessível `EAI_AGAIN` durante `npm view @netlify/vite-plugin-tanstack-start@1.3.19`; lockfile **não foi regenerado**, `npm ci`, ESLint, typecheck global e build **não aprovados**.
+- **Corrigido localmente (código):** `deleteMessageByExternalId`, `editMessageByExternalId` e `addReactionToMessage` em `src/lib/evolution.server.ts` exigem `instance_id` UUID em runtime (fail closed) e filtram a instância no lookup e no update. **Risco corrigido:** exclusão/edição/reação de mensagem entre duas conexões do mesmo workspace por chamada sem escopo. **Risco residual:** uma `instance_id` válida mas pertencente a outro workspace não é verificada pelo helper puro; o filtro composto `.eq(workspace_id).eq(instance_id)` e as rotas autenticadas continuam responsáveis pela autorização.
+- **Corrigido localmente (sync):** atualizações de `sender_avatar` e de metadados de remetente restringem-se ao `ownedInstance.id`, sem atingir mensagens da outra instância com o mesmo número de telefone. **Risco residual:** sincronização de histórico ainda sofre com índice UNIQUE antigo da mensagem; esta correção não mexe no schema.
+- **Regressões:** +4 testes em `tests/evolution-instance-mutation-scope.test.ts` e +2 testes em `tests/message-identity-diagnostic.test.ts`. São verificações unitárias/estáticas **offline**, não substituem Supabase/Evolution E2E.
+- **Preparado (não executado):** `scripts/sql/inspect-message-identity-readonly.sql` consulta metadata/contagens sem DML/DDL. `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md` documenta a transição coordenada de índices, RPC e leitores, além da impossibilidade de reverter a UNIQUE antiga sem tratar colisões novas. **G2-03/G2-04 continuam sem aprovação em staging**.
+- **Produção NO-GO**, sem deploy, sem migrations e sem reprocessamento de eventos antigos.
diff --git a/docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md b/docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md
@@ -0,0 +1,39 @@
+# Fase 12 · G2-03/G2-04 — Mensagens multi-instância: diagnóstico e migração planejada
+
+**Status:** projeto e consultas preparados **offline**; **NÃO EXECUTADO** em Supabase. Não existe migration nova aplicável neste pacote. Sem autorização para `db push`, `db reset`, `migration repair` ou reprocessar backlog vivo.
+
+## Diagnóstico baseado no repositório
+
+- A migration `20260906120000_multi_tenant_workspaces.sql` cria `idx_messages_workspace_external` para `(workspace_id, external_id) WHERE external_id IS NOT NULL`.
+- `20260906155548_add_messages_unique_constraint.sql` acrescenta `messages_workspace_external_key UNIQUE (workspace_id, external_id)`.
+- A RPC `persist_inbox_message` em `20260917210000_reconcile_inbox_architecture.sql` procura registros por `workspace_id,external_id` **sem** `instance_id` (e procura `client_message_id` por workspace); o wrapper `persistMessage` em `src/lib/evolution.server.ts` também faz pré-checagem somente por workspace + external_id.
+- Sincronização histórica já filtra `workspace_id + instance_id` na busca de existentes, porém uma inserção ainda pode colidir com a UNIQUE no banco. **Não basta corrigir uma query isolada.**
+- A Fase 12 reforçou as mutações de edição, exclusão e reação para que **sempre** requeiram `instance_id`. Também restringiu a atualização de foto e de metadados do remetente na sincronização. Essas correções **não eliminam a unicidade antiga**.
+
+## Diagnóstico somente leitura no banco de staging
+
+1. Conferir o project ref do staging; jamais usar produção como substituto. Inspecionar `scripts/sql/inspect-message-identity-readonly.sql` antes da execução.
+2. Verificar o schema real (colunas, FKs, índices/constraints, overloads de RPC, funções e políticas existentes). **Não pressupor que as migrations antigas correspondem ao schema vivo.**
+3. Agregar `missing_instance_id`, `mismatched_workspace`, `mismatched_instance` e duplicatas por `(workspace_id,instance_id,external_id)`; sanar registros legados apenas com plano de reversão aprovado.
+4. Confrontar a origem dos `external_id` em duas instâncias Evolution sandbox. O índice antigo impede armazenar o segundo registro quando o ID colide; logo, **contagem zero de colisões na tabela não prova ausência de colisões na origem**.
+5. Confirmar separadamente a semântica e os índices de `client_message_id`, inclusive outbox e idempotência de envio. Não eliminar a proteção de idempotência global/por workspace antes de determinar seu uso real.
+
+## Desenho de migração para staging — NÃO IMPLEMENTAR ATÉ PASSAR G2-01/03
+
+- Pré-requisitos: backup restaurável comprovado, relatório de constraints reais, decisão sobre nulls legados e checagem de referências downstream (mídia, chat, outbox, recibos, quoted messages e triggers), além de janela de implantação de teste.
+- Garantir `instance_id` determinístico por mensagem usando relação comprovada com `chats`/`whatsapp_instances`. **Não** preencher nulls por default arbitrário. Rejeitar transição se houver ambiguidades.
+- Em uma **migration versionada, transacional e revisada**, preparar o índice/constraint por `(workspace_id,instance_id,external_id)` para `external_id IS NOT NULL`; definir estratégia distinta para `client_message_id` após teste de semântica; remover/renomear antigos índices exclusivos **somente na mesma mudança coordenada da RPC e queries**. Não colocar duas UNIQUE incompatíveis ativas esperando que a nova resolva a colisão.
+- Atualizar a RPC `persist_inbox_message` sem mudar sua interface pública sem análise de consumidores: localizar `v_instance_id` validado e consultar `messages` por `(workspace_id,instance_id,external_id)`, mantendo o lock/advisory e incrementando `unread` uma única vez. Revisar tratamento de corrida no `INSERT` (índice único e retry/ON CONFLICT realmente coerentes).
+- Atualizar `persistMessage` e todos os leitores por `external_id` para exigir escopo da instância; conferir paths de dedup, mutations, histórico, mídia, reactions, receipts e sincronização, além de RLS.
+- Efetuar backfill de inconsistências **apenas em staging com fixture**, então executar testes de concorrência de duas instâncias do mesmo workspace com mesmo `external_id`, mensagem repetida na mesma instância, outros workspaces, chat/media de outra instância e `client_message_id` repetido. Mensagem B não pode substituir/editar A; duplicata A não deve incrementar `unread`.
+- Para rollback, documentar comportamento reversível de código e banco. Se dados com mesmo `(workspace_id,external_id)` passarem a existir nas duas instâncias, **não é seguro restaurar a UNIQUE antiga** sem política explícita de reconciliação/perda de dados (que exige aprovação separada). Preferir roll-forward compatível, snapshot pré-deploy e plano de restauração testado.
+
+## Critérios de PASS
+
+1. Constraints e funções **reais** registradas em staging e diagnóstico agregador sem inconsistências não resolvidas.
+2. Migration aplicada apenas em staging, com consistência transacional e deploy de código compatível.
+3. Mesma ID externa em instâncias A e B gera duas mensagens independentes; repetição na instância A não gera terceira; `unread`, chat e mídia ficam no dono correto.
+4. Corrida webhook + sync + outbox reprocessada sem mensagens duplicadas nem perda silenciosa; RLS/IDOR negativos cobrindo duas empresas.
+5. Restore/reversão ou roll-forward ensaiado; nenhum deploy/backfill em produção antes dos gates.
+
+**Situação real:** G2-03 e G2-04 permanecem **BLOCKED/NOT RUN** para E2E e migration; esta documentação não é prova de migração aplicada.
diff --git a/docs/FASE12_PLANO_E_CHECKLIST_ATUALIZADO.md b/docs/FASE12_PLANO_E_CHECKLIST_ATUALIZADO.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE12_PLANO_E_CHECKLIST_ATUALIZADO.md
@@ -0,0 +1,260 @@
+# InboxOS — Plano e checklist atualizado · Fase 12 / Rodada 2 (11/10/2026)
+
+**Base oficial:** `inboxos-fase11-correcoes-offline-2026-10-11.zip` — SHA256 `aa64996f9c7ff2957e31e0006f4e146ed7b46de4537f3d8bb064ba191ecd7f3d`.
+**Código entregue:** `inboxos-fase12-correcoes-scoping-2026-10-11.zip` · **produção:** NO-GO.
+
+## Resultados verificados
+
+- **195/195 testes locais PASS**; 6 novos (4 guardas/scoping, 2 SQL/documentação).
+- **269 arquivos TS com parsing PASS**, imports locais e 83 rotas PASS; Billing OFF no código.
+- **Lockfile FAIL:** seis divergências antigas permanecem; registry npm retornou `EAI_AGAIN`.
+- **Não homologados:** `npm ci`, lint global, typecheck do projeto, Vite build, Netlify build, Supabase staging, Evolution real, Groq, Resend e E2E.
+- **Mudança no banco/deploy:** nenhuma. Nenhum replay do backlog.
+
+## O que foi realmente alterado (causa → mudança → risco)
+
+1. **Edição, exclusão e reação por ID externo:** funções aceitavam instance_id opcional → agora exigem UUID válido e filtro composto por workspace + instância, inclusive no UPDATE. Risco: chamadas legadas sem ID falharão em vez de editar indiscriminadamente; todos os chamadores existentes foram auditados estaticamente.
+2. **Foto/metadados de remetente durante sync:** UPDATE por workspace+sender_phone podia afetar outras instâncias → adicionado filtro por ownedInstance.id. Risco: atualizações antigas sem instance_id não serão mais alteradas em lote; validar staging.
+3. **Chave UNIQUE do banco:** ainda é `(workspace_id,external_id)` → NÃO alterada por segurança. SQL diagnóstico somente leitura e desenho de migration coordenada foram escritos. Risco de deduplicação cross-instance ainda existe até a aprovação da migration/queries em staging.
+
+## Checklist consolidado (PASS somente com evidência no escopo descrito)
+
+### G0 — 4/7 tarefas locais aprovadas
+
+- [x] **G0-01 — Verificar integridade da base da Fase 11** | PASS | P0
+  - **Corrige:** Evitar continuar sobre pacote corrompido ou antigo. **Risco:** Mistura de versões, perda de correções.
+  - **PASS quando:** ZIP abre sem erro e estrutura InboxOS identificada. **Depende:** —.
+  - Evidência atual: ZipFile.testzip(): OK; 439 entradas no pacote da Fase 11
+- [x] **G0-02 — Registrar snapshot imutável, hash e branch de trabalho** | PASS | P0
+  - **Corrige:** Permitir comparação e rollback do código. **Risco:** Sobrescrever trabalho atual ou aplicar patch duas vezes.
+  - **PASS quando:** Git branch/snapshot e SHA256 do ZIP registrado. **Depende:** G0-01.
+  - Evidência atual: Snapshot ZIP imutável + diretório isolado; SHA256 aa64996f9c7ff2957e…; sem .git, não foi criada branch. docs/FASE12_SNAPSHOT_BASE_SHA256.md
+- [x] **G0-03 — Conferir runtime Node e npm da revisão** | PASS | P0
+  - **Corrige:** Fixar ambiente de build reprodutível. **Risco:** Versões diferentes geram dependências incompatíveis.
+  - **PASS quando:** Node >=22.12.0 e npm 10.9.2 identificados. **Depende:** —.
+  - Evidência atual: Node v22.16.0 / npm v10.9.2
+- [x] **G0-04 — Confirmar Billing desligado no código** | PASS | P0
+  - **Corrige:** Não ativar fluxo de cobrança fora de escopo. **Risco:** Assinaturas ou rotas financeiras expostas sem homologação.
+  - **PASS quando:** audit:release confirma proteção de Billing OFF. **Depende:** —.
+  - Evidência atual: PASS em auditoria 11/10/2026; flags de deploy ainda pendentes
+- [ ] **G0-05 — Preparar Supabase staging com project ref distinto** | BLOCKED | P0
+  - **Corrige:** Evitar escrever no banco de produção durante E2E. **Risco:** Dano em dados reais e migração irreversível.
+  - **PASS quando:** Ref de staging e credenciais segregadas comprovadas. **Depende:** G0-02.
+  - Evidência atual: Staging não fornecido
+- [ ] **G0-06 — Preparar Evolution v2 + contas de teste autorizadas** | BLOCKED | P0
+  - **Corrige:** Garantir troca de mensagens sem atingir clientes. **Risco:** Mensagens e webhooks atingirem produção.
+  - **PASS quando:** Instância e números exclusivos para testes, separados do produção. **Depende:** G0-05.
+  - Evidência atual: Ambiente de teste não fornecido
+- [ ] **G0-07 — Configurar segredos e contexto de preview sem valores em logs** | BLOCKED | P0
+  - **Corrige:** Separar serviço, vault e client env. **Risco:** Vazamento de service_role, API keys, tokens ou redirecionamento.
+  - **PASS quando:** ENV presentes no secret store, sem valores expostos; preview aponta somente para staging. **Depende:** G0-05.
+  - Evidência atual: ENV reais indisponíveis
+
+### G1 — 1/9 tarefas locais aprovadas
+
+- [ ] **G1-01 — Corrigir seis divergências de package-lock com npm oficial** | FAIL | P0
+  - **Corrige:** Restabelecer resolução determinística de dependências. **Risco:** Atualizações transitivas inesperadas ou quebra do adaptador Netlify.
+  - **PASS quando:** npm install --package-lock-only; diff revisado; audit:release sem divergências. **Depende:** G0-02.
+  - Evidência atual: npm view @netlify/vite-plugin-tanstack-start@1.3.19 → EAI_AGAIN; lockfile não alterado; continuam 6 divergências.
+- [ ] **G1-02 — Executar npm ci em instalação limpa** | BLOCKED | P0
+  - **Corrige:** Comprovar que dependências se instalam a partir do lock. **Risco:** Optional deps incompatíveis ou download parcial.
+  - **PASS quando:** npm ci --include=dev --include=optional sai 0. **Depende:** G1-01.
+  - Evidência atual: Registry npm inacessível (EAI_AGAIN); npm ci sem PASS neste ambiente.
+- [x] **G1-03 — Reexecutar testes unitários e regressão** | PASS | P0
+  - **Corrige:** Garantir que hotfixes existentes não regrediram. **Risco:** Novo pacote poderia alterar fixtures ou carregadores.
+  - **PASS quando:** npm test na versão final Fase 12 retorna 195/195; repetir após corrigir lockfile. **Depende:** G0-01.
+  - Evidência atual: Fase 12, npm test: 195/195 PASS (189+6); log INBOXOS_FASE12_TEST_2026-10-11.log. Repetir após reparo do lock.
+- [ ] **G1-04 — Auditoria release: parsing, imports, rotas, Billing e lockfile** | FAIL | P0
+  - **Corrige:** Confirmar integridade estrutural antes da compilação. **Risco:** Ignorar falhas restantes por falso positivo.
+  - **PASS quando:** npm run audit:release retorna 0 em TODAS as checagens. **Depende:** G1-01.
+  - Evidência atual: Fase12: audit:release FAIL 6 divergências no lock; PASS parser 269 TS, 83 rotas, imports e Billing OFF.
+- [ ] **G1-05 — Rodar ESLint completo sem afrouxar regras** | BLOCKED | P0
+  - **Corrige:** Detectar riscos de React/hooks e qualidade. **Risco:** Silenciar linter esconde bugs reais.
+  - **PASS quando:** npm run lint retorna 0 sem redução das regras. **Depende:** G1-02.
+- [ ] **G1-06 — Rodar TypeScript completo** | BLOCKED | P0
+  - **Corrige:** Detectar contratos e tipos incompatíveis. **Risco:** Casts inseguros escondem erros.
+  - **PASS quando:** npx --no-install tsc --noEmit retorna 0. **Depende:** G1-02.
+- [ ] **G1-07 — Executar build Vite e verificar artefatos** | BLOCKED | P0
+  - **Corrige:** Comprovar compilação para produção. **Risco:** Problemas SSR/hydration/rotas ainda ocultos.
+  - **PASS quando:** npm run build retorna 0 e gera cliente + handlers previstos. **Depende:** G1-05,G1-06.
+- [ ] **G1-08 — Executar build:gated Netlify na mesma revisão** | BLOCKED | P0
+  - **Corrige:** Comprovar todos os gates juntos. **Risco:** CI aceitar revisão diferente da testada.
+  - **PASS quando:** npm run build:gated retorna 0 e commit/hash registrados. **Depende:** G1-03,G1-04,G1-05,G1-06,G1-07.
+- [ ] **G1-09 — Conferir mudanças do lockfile e fixar versões realmente necessárias** | NOT RUN | P1
+  - **Corrige:** Reduzir supply-chain drift e divergências não intencionais. **Risco:** Atualização silenciosa de dependências e APIs.
+  - **PASS quando:** Diff limitado ao necessário, deps diretas alinhadas, nenhuma integridade inventada. **Depende:** G1-01.
+
+### G2 — 2/13 tarefas locais aprovadas
+
+- [ ] **G2-01 — Inventariar migrations e schema somente leitura** | BLOCKED | P0
+  - **Corrige:** Evitar executar DDL incompatível com estado real. **Risco:** Migrations antigas podem reaplicar SQL/trigger.
+  - **PASS quando:** Inventário de staging e divergências documentados. **Depende:** G0-05.
+- [ ] **G2-02 — Verificar UNIQUE/onConflict de contatos e presença** | BLOCKED | P0
+  - **Corrige:** Prevenir SQL 42P10 e duplicação. **Risco:** Índice novo conflitar com registros históricos.
+  - **PASS quando:** Constraints staging correspondem às queries e fixtures E04/E07. **Depende:** G2-01.
+- [ ] **G2-03 — Analisar colisões external_id em mensagens multi-instância** | BLOCKED | P0
+  - **Corrige:** Eliminar deduplicação cruzada dentro do workspace. **Risco:** Alterar chave incorretamente pode perder dados ou multiplicar mensagens.
+  - **PASS quando:** Consulta read-only prova se há colisões e define migração versionada. **Depende:** G2-01.
+  - Evidência atual: Diagnóstico SQL somente leitura preparado em scripts/sql; não executado sem staging. Índices/RPC legados analisados offline.
+- [ ] **G2-04 — Projetar migração atômica de chave (workspace,instance,external)** | NOT RUN | P0
+  - **Corrige:** Corrigir unicidade por instância quando schema/consultas confirmarem. **Risco:** Índice, RPC e queries não podem ser alterados isoladamente.
+  - **PASS quando:** Plano com pré-checagem, migração, compatibilidade, rollback e teste concorrente. **Depende:** G2-03.
+  - Evidência atual: Esboço documentado em docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md. Migração SQL NÃO executada/criada; depende de staging real.
+- [ ] **G2-05 — Testar RPC persist_inbox_message e buscas por instância** | BLOCKED | P0
+  - **Corrige:** Evitar gravar ou editar mensagem na instância errada. **Risco:** Risco de regressão em upsert histórico, deletes e recibos.
+  - **PASS quando:** Mesmo ID externo em duas instâncias não cruza dados nem duplica na mesma. **Depende:** G2-04.
+- [ ] **G2-06 — Reconciliar histórico e rodar migrations SOMENTE em staging** | BLOCKED | P0
+  - **Corrige:** Validar reversibilidade e estado final do banco. **Risco:** DDL parcial, triggers duplicadas e bloqueios.
+  - **PASS quando:** Migrations de staging verdes, sem drift e rollback testado. **Depende:** G2-01,G2-02,G2-04.
+- [ ] **G2-07 — Executar testes RLS com dois workspaces, duas instâncias** | BLOCKED | P0
+  - **Corrige:** Comprovar isolamento verdadeiro além dos mocks. **Risco:** Cross-tenant por service_role, join ou IDOR.
+  - **PASS quando:** Dados A inacessíveis a B em chats, mídia, CRM, convite, agentes e exports. **Depende:** G2-06.
+- [ ] **G2-08 — Concorrência do último owner/superadmin** | BLOCKED | P0
+  - **Corrige:** Preservar ao menos um proprietário/administrador ativo. **Risco:** Race condition pode remover último privilegiado.
+  - **PASS quando:** Duas transações simultâneas não deixam zero privilegiados ativos. **Depende:** G2-06.
+- [ ] **G2-09 — Validar transferência owner e revogação/suspensão** | BLOCKED | P0
+  - **Corrige:** Garantir autorização atômica e sessões inválidas. **Risco:** Permissões ficam no cache após mudança.
+  - **PASS quando:** Transferência correta; token revogado/suspenso recebe negativa no request seguinte. **Depende:** G2-06.
+- [ ] **G2-10 — Auditar bucket, assinatura de mídia e vault das integrações** | BLOCKED | P0
+  - **Corrige:** Prevenir leak de imagem e credencial multi-tenant. **Risco:** URL assinada expõe recurso ou token em frontend.
+  - **PASS quando:** Apenas owner autorizado acessa mídia e segredos ficam server-side. **Depende:** G2-07.
+- [ ] **G2-11 — Testar backup e restauração em staging** | BLOCKED | P0
+  - **Corrige:** Garantir rollback de schema/dados sem improviso. **Risco:** Recuperação não funcionar em incidente.
+  - **PASS quando:** Backup/PITR demonstrado em ambiente de teste com tempos registrados. **Depende:** G2-06.
+- [x] **G2-12 — Blindar mutações Evolution por instance_id no código** | PASS | P0
+  - **Corrige:** Evitar edições, exclusões, reações e fotos cross-instance em mesmo workspace. **Risco:** Caller legada sem instance_id falha fechada; E2E e schema ainda não homologados.
+  - **PASS quando:** Guard obrigatório + filtros em buscas/updates + regressões offline aprovadas. **Depende:** G0-02.
+  - Evidência atual: 4 novos testes evolução instance scope PASS; edições de evolution.server.ts e sync-engine.ts; sem alterações de banco
+- [x] **G2-13 — Preparar SQL de diagnóstico read-only e projeto de migração** | PASS | P0
+  - **Corrige:** Prevenir alteração insegura da UNIQUE antiga e planejar migração coordenada. **Risco:** Consulta em staging pode evidenciar divergências; análise offline não prova ausência de colisões.
+  - **PASS quando:** SQL sem DML/DDL + documento de pré-checagem/migração/rollback + testes estáticos. **Depende:** G0-02.
+  - Evidência atual: scripts/sql/inspect-message-identity-readonly.sql + docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md; 2 testes PASS; staging NOT RUN
+
+### G3 — 0/12 tarefas locais aprovadas
+
+- [ ] **G3-01 — Homologar auth: cadastro, login, OTP, recuperação e sessões** | BLOCKED | P0
+  - **Corrige:** Comprovar fluxos críticos de identidade. **Risco:** OTP reutilizável ou sessões não revogadas.
+  - **PASS quando:** HTTP 200/201, 401/403/409 conforme cenário; tokens expirados inválidos. **Depende:** G2-07,G1-08.
+- [ ] **G3-02 — Testar papéis ADM e membros, convites e suspensão** | BLOCKED | P0
+  - **Corrige:** Evitar escalada de privilégio e ações cruzadas. **Risco:** Rota ADM sem guard ou papel em cache.
+  - **PASS quando:** Papéis enforcement no servidor em todas as mutações. **Depende:** G3-01.
+- [ ] **G3-03 — Testar ingress webhook: token, JSON, payload, rate-limit** | BLOCKED | P0
+  - **Corrige:** Garantir fail-closed do endpoint público. **Risco:** Aceitação indevida/consumo excessivo.
+  - **PASS quando:** Casos 400/401/413/429/503 esperados sem efeitos colaterais. **Depende:** G2-06,G1-08.
+- [ ] **G3-04 — Comprovar persistência e idempotência do webhook** | BLOCKED | P0
+  - **Corrige:** Garantir queued→completed e não apenas HTTP 2xx. **Risco:** Duplicatas e falso sucesso em falha Supabase.
+  - **PASS quando:** Mesmo evento produz uma escrita e status coerente; erros viram failed/retry. **Depende:** G3-03.
+- [ ] **G3-05 — Simular worker concorrente / CAS / dead-letter** | BLOCKED | P0
+  - **Corrige:** Confirmar hotfix da Fase 11 sob concorrência. **Risco:** Mais retries podem aumentar fila em indisponibilidade.
+  - **PASS quando:** Somente worker com claim conclui; falhas de DB não finalizam evento. **Depende:** G3-04.
+- [ ] **G3-06 — Revalidar recovery cron e limites de lote** | BLOCKED | P0
+  - **Corrige:** Recuperar evento preso sem tempestade de execução. **Risco:** Backfill agressivo causa duplicatas ou resposta IA retroativa.
+  - **PASS quando:** Stale processing/failed recuperados sob política; nenhuma resposta retroativa. **Depende:** G3-05.
+- [ ] **G3-07 — Testar outbox com dois envios do mesmo clientMessageId** | BLOCKED | P0
+  - **Corrige:** Evitar mensagens duplicadas em race. **Risco:** Dois workers enviam simultaneamente.
+  - **PASS quando:** Apenas um envio remoto/aceitação com mesma chave idempotente. **Depende:** G3-05.
+- [ ] **G3-08 — Testar timeout/408/5xx e reconciliação sem reenvio** | BLOCKED | P0
+  - **Corrige:** Evitar retry cego quando resultado remoto é ambíguo. **Risco:** Mensagem enviada duas vezes.
+  - **PASS quando:** Estado unknown/accepted reconciliado por IDs, sem novo disparo. **Depende:** G3-07.
+- [ ] **G3-09 — Validar mutation: edição/exclusão/reação/recibos** | BLOCKED | P0
+  - **Corrige:** Evitar edição ou alteração de status da mensagem errada. **Risco:** Eventos atrasados regridem status ou cruzam instâncias.
+  - **PASS quando:** Mensagem correta, ordem preservada, READ não regrede. **Depende:** G3-04.
+- [ ] **G3-10 — Validar contatos, chats, grupos e permissões sob E2E** | BLOCKED | P0
+  - **Corrige:** Comprovar hotfix de grupos/cache em produção isolada. **Risco:** Cache stale e permissões indevidas em eventos fora de ordem.
+  - **PASS quando:** Mesmo JID em 2 workspaces/instâncias não contamina metadados. **Depende:** G3-04,G2-07.
+- [ ] **G3-11 — Testar uploads, mídias e recibos com permissões** | BLOCKED | P1
+  - **Corrige:** Garantir fluxo de arquivos e acesso correto. **Risco:** Payload acima do limite, assinatura inválida, upload indevido.
+  - **PASS quando:** Arquivos permitidos passam e inválidos falham sem escrita pública. **Depende:** G2-10,G3-09.
+- [ ] **G3-12 — Cobrir contratos HTTP restantes com matriz de smoke** | BLOCKED | P1
+  - **Corrige:** Detectar endpoints quebrados após migrações. **Risco:** Rotas com 500 apesar de build verde.
+  - **PASS quando:** Contratos críticos 2xx/4xx previsíveis e sem 500/tenant leak. **Depende:** G3-01,G3-04.
+
+### G4 — 0/8 tarefas locais aprovadas
+
+- [ ] **G4-01 — Confirmar versão/contrato real da Evolution API v2** | BLOCKED | P0
+  - **Corrige:** Evitar incompatibilidade de payloads/eventos. **Risco:** Documentação de versão diferente mascarar falhas.
+  - **PASS quando:** Versão instalada e endpoints de webhook/QR validados. **Depende:** G0-06.
+- [ ] **G4-02 — Testar QR, conexão, desconexão e reconexão** | BLOCKED | P0
+  - **Corrige:** Comprovar lifecycle de conexão do painel. **Risco:** Reconfigurar instância produtiva por engano.
+  - **PASS quando:** Somente instância sandbox muda; UI, API e banco concordam. **Depende:** G4-01,G5-01.
+- [ ] **G4-03 — Testar contatos @lid, grupos e atualização de participantes** | BLOCKED | P0
+  - **Corrige:** Comprovar nome/foto, isolamento e canSend. **Risco:** Grupos abertos serem tratados como bloqueados.
+  - **PASS quando:** Cenários E04–E07/E12/E13 verdes com Evolution real. **Depende:** G4-01,G3-10.
+- [ ] **G4-04 — Testar envio/recebimento e status de mensagens reais** | BLOCKED | P0
+  - **Corrige:** Comprovar E2E de mensagens. **Risco:** Envio não persistir ou ser duplicado.
+  - **PASS quando:** Painel, banco e WhatsApp sandbox concordam com IDs/estado. **Depende:** G4-02,G3-08.
+- [ ] **G4-05 — Testar mídia, edição, exclusão, reação e recibos** | BLOCKED | P0
+  - **Corrige:** Cobrir eventos pouco testados. **Risco:** Falha silenciosa em mensagens alteradas.
+  - **PASS quando:** E08–E11/E20 aprovados e rastreados. **Depende:** G4-04.
+- [ ] **G4-06 — Validar Groq sandbox, timeout e mensagens antigas** | BLOCKED | P1
+  - **Corrige:** Evitar resposta automática retroativa. **Risco:** Resposta do agente para backlog antigo.
+  - **PASS quando:** IA não responde a eventos antigos ou duplicados. **Depende:** G4-04.
+- [ ] **G4-07 — Validar Resend: OTP, recuperação e falha de entrega** | BLOCKED | P0
+  - **Corrige:** Assegurar login e alertas. **Risco:** OTP não entregue ou reenviado em cascata.
+  - **PASS quando:** Emails chegam somente a caixas de teste, falhas tratadas. **Depende:** G3-01.
+- [ ] **G4-08 — Validar newsletter com opt-in/opt-out em sandbox** | BLOCKED | P1
+  - **Corrige:** Evitar envios e dados de marketing incorretos. **Risco:** Newsletter real enviada sem autorização.
+  - **PASS quando:** Agendamento/cancelamento/descadastro corretos em lista teste. **Depende:** G4-07.
+
+### G5 — 0/9 tarefas locais aprovadas
+
+- [ ] **G5-01 — Publicar Deploy Preview com ENV isoladas** | BLOCKED | P0
+  - **Corrige:** Simular produção sem risco a clientes. **Risco:** Preview apontar Supabase/Evolution produtivos.
+  - **PASS quando:** URL preview, env do contexto e ref staging comprovados. **Depende:** G1-08,G0-05,G0-06,G0-07.
+- [ ] **G5-02 — Bloquear escrita de webhook de produção em preview** | BLOCKED | P0
+  - **Corrige:** Impedir alterações de webhook da instância real. **Risco:** Mensagem da produção roteada a preview.
+  - **PASS quando:** EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false; checagens de host e ref OK. **Depende:** G5-01.
+- [ ] **G5-03 — Rodar audit:env sem revelar segredos** | BLOCKED | P0
+  - **Corrige:** Comprovar vault/bootstrap/billing/env. **Risco:** Bootstrap admin ativo ou chave inválida.
+  - **PASS quando:** npm run audit:env PASS no contexto escolhido. **Depende:** G5-01.
+- [ ] **G5-04 — Rodar synthetic smoke em dry-run e execução segura** | BLOCKED | P0
+  - **Corrige:** Comprovar ingress por endereço público. **Risco:** Ensaio atingir produção ou ser tomado por E2E completo.
+  - **PASS quando:** Dry-run OK + --execute somente preview, status persistido no staging. **Depende:** G5-02,G3-04.
+- [ ] **G5-05 — Executar test:integration e testes HTTP na URL preview** | BLOCKED | P0
+  - **Corrige:** Detectar rotas quebradas de deploy. **Risco:** Resposta de mock diferente do runtime Netlify.
+  - **PASS quando:** TEST_BASE_URL preview; suíte de integração verde. **Depende:** G5-04,G3-12.
+- [ ] **G5-06 — Conferir responsividade e interações 320–desktop** | BLOCKED | P1
+  - **Corrige:** Prevenir bugs de viewport e teclado. **Risco:** Modais e rolagem podem travar no mobile.
+  - **PASS quando:** Flows de auth, inbox, CRM e ADM sem overflow/console errors. **Depende:** G5-01.
+- [ ] **G5-07 — Testar cache, reconexão e falhas parciais de rede** | BLOCKED | P1
+  - **Corrige:** Garantir que UI não mostre falso sucesso. **Risco:** Estado stale e envio duplicado por clique.
+  - **PASS quando:** Erros claros, retries seguros e dados atualizados após refresh. **Depende:** G5-05.
+- [ ] **G5-08 — Instrumentar fila, erros 5xx, cron e logs redigidos** | BLOCKED | P0
+  - **Corrige:** Detectar falha antes de atingir clientes. **Risco:** Backlog cresce silenciosamente.
+  - **PASS quando:** Métricas queued/failed/dead_letter, logs sem PII e alerta funcional. **Depende:** G5-04.
+- [ ] **G5-09 — Testar rollback do deploy e restauração da operação** | BLOCKED | P0
+  - **Corrige:** Reduzir tempo de recuperação após incidente. **Risco:** Rollback de app incompatível com schema alterado.
+  - **PASS quando:** Volta de preview reproduzida sem perder eventos. **Depende:** G2-11,G5-05.
+
+### G6 — 0/7 tarefas locais aprovadas
+
+- [ ] **G6-01 — Consolidar relatório de gates em uma revisão e evidências** | NOT RUN | P0
+  - **Corrige:** Evitar aprovar commit diferente daquele testado. **Risco:** Testes de revisões distintas geram falso GO.
+  - **PASS quando:** G1–G5 comprovados no mesmo SHA, logs redigidos e datados. **Depende:** G1-08,G2-11,G5-09.
+- [ ] **G6-02 — Auditar backlog real SOMENTE leitura após release validado** | BLOCKED | P0
+  - **Corrige:** Estimar recuperação segura dos eventos acumulados. **Risco:** Reprocessar eventos antigos gera duplicação/IA retroativa.
+  - **PASS quando:** Contagens e causas atuais conhecidas, sem write em produção. **Depende:** G6-01.
+  - Evidência atual: Snapshot 02/10 é histórico, não atualizado
+- [ ] **G6-03 — Definir decisão GO/NO-GO e plano canário** | BLOCKED | P0
+  - **Corrige:** Controlar risco de publicação. **Risco:** Lançamento com fila falhando ou rollback ausente.
+  - **PASS quando:** Todos G1–G5 PASS e nenhum bloqueio crítico. **Depende:** G6-01.
+- [ ] **G6-04 — Obter autorização explícita específica para produção** | BLOCKED | P0
+  - **Corrige:** Evitar mudanças não autorizadas. **Risco:** Deploy afeta clientes e dados reais.
+  - **PASS quando:** Aprovação do responsável registrada APÓS homologação. **Depende:** G6-03.
+  - Evidência atual: Não autorizado
+- [ ] **G6-05 — Publicar versão em produção com canário monitorado** | BLOCKED | P0
+  - **Corrige:** Disponibilizar correções comprovadas. **Risco:** Regressão ao vivo e picos de fila.
+  - **PASS quando:** Deploy autorizado, health+fila estabilizados, rollback disponível. **Depende:** G6-04.
+- [ ] **G6-06 — Solicitar autorização distinta para replay do backlog** | BLOCKED | P0
+  - **Corrige:** Impedir disparo retroativo de milhares de eventos. **Risco:** Mensagens/IA duplicadas, custo e rate limit.
+  - **PASS quando:** Canário pequeno definido, revisão manual e autorização específica. **Depende:** G6-02,G6-05.
+  - Evidência atual: Não autorizado
+- [ ] **G6-07 — Executar replay seletivo canário e reavaliar métricas** | BLOCKED | P0
+  - **Corrige:** Recuperar eventos com segurança. **Risco:** Backlog e mensagens podem ser amplificados.
+  - **PASS quando:** Sem duplicatas, métricas estáveis; sem batch integral. **Depende:** G6-06.
+
+## Decisão de release
+
+Continua **NO-GO**, independente dos testes locais. G1 obrigatório (lockfile oficial, npm ci, lint, typecheck, builds), G2–G5 reais em staging e GO operacional exigem evidência da mesma revisão. Produção e replay de backlog exigem autorizações **separadas**.
+
+Documentos internos anexos: `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md`, `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`, `scripts/sql/inspect-message-identity-readonly.sql`.
diff --git a/docs/FASE12_SNAPSHOT_BASE_SHA256.md b/docs/FASE12_SNAPSHOT_BASE_SHA256.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE12_SNAPSHOT_BASE_SHA256.md
@@ -0,0 +1,10 @@
+# Fase 12: baseline e rollback do código
+
+- Fonte imutável: `inboxos-fase11-correcoes-offline-2026-10-11.zip`
+- SHA256: `aa64996f9c7ff2957e31e0006f4e146ed7b46de4537f3d8bb064ba191ecd7f3d`
+- Inspeção ZIP: 439 entradas e `testzip() == None`
+- Snapshot isolado de desenvolvimento: extraído em `/mnt/data/inboxos_phase12_work/inboxos-evolution-final-audit`
+- Histórico `.git`: ausente na origem (logo, não é lícito inventar commit nem branch)
+- G0-02: **PASS pelo método de snapshot**, com HASH verificado. Registro de branch remoto: PENDENTE se o fluxo exigir Git.
+- Rollback de código: reextrair **somente** o ZIP Fase 11 para uma pasta nova. NÃO é rollback do schema/banco.
+- Escopo desta fase: offline; sem Netlify, Evolution ou Supabase real.
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
diff --git a/scripts/sql/inspect-message-identity-readonly.sql b/scripts/sql/inspect-message-identity-readonly.sql
new file mode 100644
--- /dev/null
+++ b/scripts/sql/inspect-message-identity-readonly.sql
@@ -0,0 +1,61 @@
+-- InboxOS G2-03 | DIAGNOSTICO SOMENTE LEITURA | staging isolado
+-- Conferir project_ref do Supabase ANTES de executar; NÃO substitui E2E.
+-- Proposito: identificar schema real, indices, dados sem instance_id e inconsistencias
+-- entre message.instance_id e chat.instance_id. NAO altera absolutamente nenhum registro.
+-- Este snapshot nao consegue revelar mensagens de outra instancia que foram recusadas
+-- pela UNIQUE antiga: a ausencia de duplicatas NAO comprova ausencia de colisoes.
+
+-- 1. Colunas reais (versoes legadas variam).
+select table_name, column_name, data_type, is_nullable
+from information_schema.columns
+where table_schema = 'public'
+  and table_name in ('messages', 'chats', 'whatsapp_instances')
+  and column_name in ('id', 'workspace_id', 'instance_id', 'external_id', 'client_message_id', 'chat_id', 'instance_name')
+order by table_name, ordinal_position;
+
+-- 2. Indices, incluindo unicos parciais (ON CONFLICT deve corresponder ao index).
+select tablename, indexname, indexdef
+from pg_indexes
+where schemaname = 'public' and tablename in ('messages', 'chats')
+order by tablename, indexname;
+
+-- 3. Constraints e FKs como existem agora; migrations locais NAO sao fonte do schema vivo.
+select conrelid::regclass::text as relation_name, conname, contype,
+       pg_get_constraintdef(oid) as definition
+from pg_constraint
+where connamespace = 'public'::regnamespace
+  and conrelid in ('public.messages'::regclass, 'public.chats'::regclass)
+order by relation_name, conname;
+
+-- 4. Resumo por workspace sem texto, numero de telefone ou IDs de mensagens.
+-- Executar SO se a consulta 1 confirmar estas colunas em mensagens/chats.
+select m.workspace_id,
+       count(*) as message_count,
+       count(*) filter (where m.instance_id is null) as missing_instance_id,
+       count(*) filter (where m.external_id is not null) as with_external_id,
+       count(*) filter (where c.id is null) as missing_chat,
+       count(*) filter (where c.id is not null and c.workspace_id is distinct from m.workspace_id) as mismatched_workspace,
+       count(*) filter (where c.id is not null and c.instance_id is distinct from m.instance_id) as mismatched_instance
+from public.messages m
+left join public.chats c on c.id = m.chat_id
+group by m.workspace_id
+order by m.workspace_id;
+
+-- 5. Duplicatas preexistentes no escopo proposto (nao retorna mensagem ou dados pessoais).
+-- Executar SO se a consulta 1 confirmar m.instance_id e m.external_id.
+select count(*) as duplicate_scope_groups
+from (
+  select workspace_id, instance_id, external_id
+  from public.messages
+  where external_id is not null
+  group by workspace_id, instance_id, external_id
+  having count(*) > 1
+) as duplicates;
+
+-- 6. Confirmar funcoes e respectivas assinaturas antes de planejar substituicao atomica.
+select p.oid::regprocedure::text as signature,
+       pg_get_function_result(p.oid) as return_type
+from pg_proc p
+join pg_namespace n on n.oid = p.pronamespace
+where n.nspname='public' and p.proname in ('persist_inbox_message', 'mark_chat_read')
+order by signature;
diff --git a/src/lib/evolution.server.ts b/src/lib/evolution.server.ts
--- a/src/lib/evolution.server.ts
+++ b/src/lib/evolution.server.ts
@@ -1,3 +1,4 @@
+import { requireMessageInstanceScope } from "@/server/evolution/message-scope";
 import { fetchCredentialed } from "@/server/security/credentialed-fetch";
 import { evolutionWebhookUrl, assertEvolutionWebhookConfigurationAllowed } from "@/server/evolution/webhook-url";
 /**
@@ -599,29 +600,32 @@
   return null;
 }
 
-export async function deleteMessageByExternalId(workspaceId: string, externalId: string, instanceId?: string) {
+// Falha fechada: mutações externas NUNCA podem operar sem instância resolvida.
+export async function deleteMessageByExternalId(workspaceId: string, externalId: string, instanceId: string) {
+  const scopedInstanceId = requireMessageInstanceScope(instanceId);
   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
   const query = supabaseAdmin
     .from("messages")
     .update({ type: "deleted" as any, text: "Mensagem apagada" })
     .eq("workspace_id", workspaceId)
     .eq("external_id", externalId);
-  return instanceId ? query.eq("instance_id", instanceId) : query;
+  return query.eq("instance_id", scopedInstanceId);
 }
 
 export async function editMessageByExternalId(
   workspaceId: string,
   externalId: string,
   newText: string,
-  instanceId?: string,
+  instanceId: string,
 ) {
+  const scopedInstanceId = requireMessageInstanceScope(instanceId);
   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
   const lookup = supabaseAdmin
     .from("messages")
     .select("id")
     .eq("workspace_id", workspaceId)
     .eq("external_id", externalId);
-  const { data: existing, error: lookupError } = await (instanceId ? lookup.eq("instance_id", instanceId) : lookup).maybeSingle();
+  const { data: existing, error: lookupError } = await lookup.eq("instance_id", scopedInstanceId).maybeSingle();
   if (lookupError) return { error: lookupError };
 
   if (existing) {
@@ -631,7 +635,9 @@
         text: newText,
         is_edited: true,
       })
-      .eq("id", existing.id);
+      .eq("id", existing.id)
+      .eq("workspace_id", workspaceId)
+      .eq("instance_id", scopedInstanceId);
   }
   return null;
 }
@@ -640,16 +646,17 @@
   workspaceId: string,
   externalId: string,
   reactionEmoji: string,
-  senderPhone?: string,
-  instanceId?: string,
+  senderPhone: string | undefined,
+  instanceId: string,
 ) {
+  const scopedInstanceId = requireMessageInstanceScope(instanceId);
   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
   const lookup = supabaseAdmin
     .from("messages")
     .select("id, reactions")
     .eq("workspace_id", workspaceId)
     .eq("external_id", externalId);
-  const { data: existing, error: lookupError } = await (instanceId ? lookup.eq("instance_id", instanceId) : lookup).maybeSingle();
+  const { data: existing, error: lookupError } = await lookup.eq("instance_id", scopedInstanceId).maybeSingle();
   if (lookupError) return { error: lookupError };
 
   if (existing) {
@@ -666,7 +673,9 @@
       .update({
         reactions: updatedReactions,
       })
-      .eq("id", existing.id);
+      .eq("id", existing.id)
+      .eq("workspace_id", workspaceId)
+      .eq("instance_id", scopedInstanceId);
   }
   return null;
 }
diff --git a/src/server/evolution/message-scope.ts b/src/server/evolution/message-scope.ts
new file mode 100644
--- /dev/null
+++ b/src/server/evolution/message-scope.ts
@@ -0,0 +1,9 @@
+/** Guard against accidental workspace-wide Evolution message mutations.
+ * A workspace can own multiple WhatsApp instances with the same external message ID.
+ */
+export function requireMessageInstanceScope(instanceId: string): string {
+  if (typeof instanceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId)) {
+    throw new Error("Evolution message mutation requires a valid instance_id");
+  }
+  return instanceId;
+}
diff --git a/src/server/evolution/sync-engine.ts b/src/server/evolution/sync-engine.ts
--- a/src/server/evolution/sync-engine.ts
+++ b/src/server/evolution/sync-engine.ts
@@ -367,7 +367,8 @@
               sender_avatar: senderAvatar,
             })
             .eq("id", existingMessage.id)
-            .eq("workspace_id", workspaceId);
+            .eq("workspace_id", workspaceId)
+            .eq("instance_id", ownedInstance.id);
         }
       }
       continue;
@@ -645,6 +646,7 @@
                 .from("messages")
                 .update({ sender_avatar: pic })
                 .eq("workspace_id", workspaceId)
+                .eq("instance_id", ownedInstance.id)
                 .eq("sender_phone", senderPhone);
             }
           })
diff --git a/tests/evolution-instance-mutation-scope.test.ts b/tests/evolution-instance-mutation-scope.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/evolution-instance-mutation-scope.test.ts
@@ -0,0 +1,44 @@
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import test from "node:test";
+import { requireMessageInstanceScope } from "../src/server/evolution/message-scope.ts";
+
+const lib = readFileSync(new URL("../src/lib/evolution.server.ts", import.meta.url), "utf8");
+const sync = readFileSync(new URL("../src/server/evolution/sync-engine.ts", import.meta.url), "utf8");
+const uuid = "abcdef01-2345-6789-abcd-0123456789ab";
+
+test("mutation scope rejects missing or malformed instance id (fail closed)", () => {
+  assert.equal(requireMessageInstanceScope(uuid), uuid);
+  for (const bad of ["", " ", "undefined", "not-a-uuid", undefined, null, 42]) {
+    assert.throws(() => requireMessageInstanceScope(bad as string), /requires a valid instance_id/);
+  }
+});
+
+test("external mutation helpers require and apply instance scope", () => {
+  const chunks = [
+    lib.split("export async function deleteMessageByExternalId(")[1]?.split("export async function editMessageByExternalId(")[0],
+    lib.split("export async function editMessageByExternalId(")[1]?.split("export async function addReactionToMessage(")[0],
+    lib.split("export async function addReactionToMessage(")[1]?.split("export interface UpsertMessageInput")[0],
+  ];
+  for (const chunk of chunks) {
+    assert.ok(chunk);
+    assert.match(chunk, /instanceId: string/);
+    assert.doesNotMatch(chunk, /instanceId\?: string/);
+    assert.match(chunk, /requireMessageInstanceScope\(instanceId\)/);
+    assert.match(chunk, /\.eq\("workspace_id", workspaceId\)/);
+    assert.match(chunk, /\.eq\("instance_id", scopedInstanceId\)/);
+  }
+});
+
+test("message edits and reactions preserve scope at both lookup and update", () => {
+  const edit = lib.split("export async function editMessageByExternalId(")[1]?.split("export async function addReactionToMessage(")[0] ?? "";
+  const reaction = lib.split("export async function addReactionToMessage(")[1]?.split("export interface UpsertMessageInput")[0] ?? "";
+  for (const chunk of [edit, reaction]) {
+    assert.ok((chunk.match(/\.eq\("instance_id", scopedInstanceId\)/g) ?? []).length >= 2);
+  }
+});
+
+test("sender profile fixes never update messages across WhatsApp instances", () => {
+  assert.match(sync, /\.update\(\{ sender_avatar: pic \}\)[\s\S]*?\.eq\("workspace_id", workspaceId\)\s*\.eq\("instance_id", ownedInstance.id\)\s*\.eq\("sender_phone", senderPhone\)/);
+  assert.match(sync, /\.eq\("id", existingMessage.id\)\s*\.eq\("workspace_id", workspaceId\)\s*\.eq\("instance_id", ownedInstance.id\)/);
+});
diff --git a/tests/message-identity-diagnostic.test.ts b/tests/message-identity-diagnostic.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/message-identity-diagnostic.test.ts
@@ -0,0 +1,23 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+import { readFileSync } from 'node:fs';
+
+const sql = readFileSync(new URL('../scripts/sql/inspect-message-identity-readonly.sql', import.meta.url), 'utf8');
+const design = readFileSync(new URL('../docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md', import.meta.url), 'utf8');
+
+test('diagnostic SQL is read-only and checks real indexes and constraints', () => {
+  const body = sql.replace(/--[^\n]*/g, '');
+  assert.doesNotMatch(body, /\b(insert|update|delete|alter|drop|truncate|grant|revoke|execute|call|create)\b/i);
+  assert.match(body, /from pg_indexes/i);
+  assert.match(body, /from pg_constraint/i);
+  assert.match(body, /m\.instance_id/i);
+  assert.match(body, /having count\(\*\) > 1/i);
+});
+
+test('migration design acknowledges old unique index, RPC and non-reversible old constraint', () => {
+  assert.match(design, /messages_workspace_external_key/);
+  assert.match(design, /persist_inbox_message/);
+  assert.match(design, /client_message_id/);
+  assert.match(design, /não é seguro restaurar a UNIQUE antiga/i);
+  assert.match(design, /NÃO EXECUTADO/);
+});

```

### Histórico Fase 13

```diff
--- a/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
+++ b/docs/ANTIGRAVITY_CHECKLIST_RELEASE.md
@@ -115,3 +115,11 @@
 - **Regressões:** +4 testes em `tests/evolution-instance-mutation-scope.test.ts` e +2 testes em `tests/message-identity-diagnostic.test.ts`. São verificações unitárias/estáticas **offline**, não substituem Supabase/Evolution E2E.
 - **Preparado (não executado):** `scripts/sql/inspect-message-identity-readonly.sql` consulta metadata/contagens sem DML/DDL. `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md` documenta a transição coordenada de índices, RPC e leitores, além da impossibilidade de reverter a UNIQUE antiga sem tratar colisões novas. **G2-03/G2-04 continuam sem aprovação em staging**.
 - **Produção NO-GO**, sem deploy, sem migrations e sem reprocessamento de eventos antigos.
+
+## Fase 13 — Preflight seguro de webhook sintético (11/10/2026)
+
+- **Correção implementada, escopo local:** `scripts/evolution-preview-smoke.mjs` valida URL de Deploy Preview, project refs staging/produção, URL de produção, token com tamanho mínimo, nome da instância e confirmações explícitas de banco isolado **e** respostas automáticas desativadas **antes** de fazer qualquer POST. O antigo `productionRef` fixo foi substituído por um ref declarado e validado, mantendo a referência histórica protegida como defesa adicional.
+- **Motivo:** um ref fixo pode ficar desatualizado depois da troca de projeto; o timestamp de mensagem antiga não impede todas as automações, então o script anterior podia causar efeitos não previstos ao testar webhooks.
+- **Regressões avaliadas:** dry-run permanece sem requisições; `--execute` sem credenciais/confirmações bloqueia sem rede; URLs disfarçadas, produção e staging iguais e tokens incompletos bloqueados. Testes locais automatizados PASS; **não** houve chamada real à Evolution.
+- **Risco residual:** os valores de `EVOLUTION_STAGING_SUPABASE_REF` e confirmações são declarados pelo operador e não verificam, por si só, a conexão efetiva do Deploy Preview. Exigir conferência visual/configuração no host e teste de persistência no banco de staging antes de marcar G5 como PASS.
+- **G1 continua FAIL/BLOCKED:** lockfile com seis divergências, registry npm `EAI_AGAIN`. Lint, typecheck global, build e deploy ainda NOT RUN/BLOCKED. Produção **NO-GO**.
--- a/docs/ANTIGRAVITY_TESTES_EVOLUTION.md
+++ b/docs/ANTIGRAVITY_TESTES_EVOLUTION.md
@@ -14,10 +14,15 @@
 # EVOLUTION_STAGING_WEBHOOK_URL=https://deploy-preview-123--site.netlify.app/api/public/webhooks/evolution
 # EVOLUTION_STAGING_INSTANCE=wa_test_1
 # EVOLUTION_STAGING_WEBHOOK_TOKEN=[secret de staging]
-# EVOLUTION_STAGING_SUPABASE_REF=[project ref que NÃO seja o da produção]
+# EVOLUTION_STAGING_SUPABASE_REF=[project ref de staging, 20 caracteres]
+# EVOLUTION_PRODUCTION_SUPABASE_REF=[project ref verdadeiro da produção, 20 caracteres]
+# PRODUCTION_APP_URL=https://app.seudominio.com
 # STAGING_ISOLATED_DB_CONFIRMED=yes
+# STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes
 node scripts/evolution-preview-smoke.mjs --execute
 ```
+**Fase 13 — proteção adicional:** `--execute` também exige a referência explícita da produção, URL de produção para bloquear o mesmo origin, confirmação de que o preview usa banco separado e confirmação de que agentes/respostas automáticas estão desativados. O timestamp antigo **não garante** que agentes não disparem respostas. A conferência manual da configuração do Preview continua obrigatória: variáveis fornecidas pelo operador não provam qual banco foi configurado no deploy.
+
 O script envia cinco eventos **sintéticos** (`CONTACTS_UPDATE`, `CHATS_UPSERT`, `PRESENCE_UPDATE`, `MESSAGES_UPDATE`, `MESSAGES_UPSERT`) e bloqueia hosts fora do padrão `deploy-preview-N--site.netlify.app`. `HTTP 2xx` apenas confirma aceitação: consultar staging depois para verificar transição `queued→completed`, efeitos reais e logs.
 
 ## Matriz funcional — execução em staging
--- /dev/null
+++ b/docs/FASE13_PLANO_E_CHECKLIST.md
@@ -0,0 +1,297 @@
+# InboxOS — Fase 13 · Plano de implementação e checklist (11/10/2026)
+
+**Base real modificada:** `inboxos-fase12-correcoes-scoping-2026-10-11.zip` (SHA256 `dab3b3efe6c3b05acfb527168a742a6d30b3f35c19079cbce07f0779bdf57bb2`).
+**Estado:** pré-produção / NO-GO. **Testes locais:** 202/202 PASS (195 anteriores + 7 novos).
+**Status rastreável:** 8/66 PASS; 58 abertos. **Produção:** nenhuma alteração executada.
+
+## Mudanças concluídas nesta rodada
+
+1. **Proteção do teste sintético Evolution:** `scripts/evolution-preview-smoke.mjs` deixa de confiar apenas em uma referência fixa do Supabase e exige `EVOLUTION_PRODUCTION_SUPABASE_REF` e `PRODUCTION_APP_URL` reais. Continua protegendo a ref histórica da produção. Corrige o risco de uma troca de projeto tornar inoperante a comparação anterior.
+2. **Bloqueio de respostas automáticas:** agora exige `STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes`, porque eventos inbound sintéticos podem acionar agentes apesar de um timestamp antigo. **Importante:** isso é uma declaração do operador, não desligamento automático; verificar configuração no preview.
+3. **Guarda fail-closed:** URL https de Deploy Preview no host e caminho exatos, refs Supabase com formato esperado, produção e staging diferentes, token de webhook com tamanho mínimo e nome de instância validado. Os valores sensíveis não são exibidos.
+4. **7 testes de regressão:** preview válido, separação de refs, flags obrigatórias, URL maliciosa, URL de produção/token curto, modo dry-run e `--execute` sem credenciais. Resultado: **202/202 testes locais PASS**.
+5. **Acompanhamento:** painel Excel atualizado com fórmulas de contagem e tarefa G3-13 PASS (segurança do script local, NÃO homologação remota).
+
+## Causa → correção → possível regressão → como verificar
+
+| Causa | Correção | Risco residual e mitigação | Evidência |
+|---|---|---|---|
+| Prod ref codificada estaticamente | Exigir ref explícita em ENV e comparar refs | Operador pode declarar ref errada: conferir projetos efetivos no Netlify e Supabase | 2 testes PASS |
+| Webhook sintético inbound pode disparar agente | Exigir confirmação de auto-reply desligado | Confirmação não desliga o sistema: inspecionar staging antes de --execute | 1 teste PASS |
+| Possibilidade de alvo inesperado | URL exata de preview, esquema HTTPS e tokens validados | Novas ENV obrigatórias podem bloquear rotinas antigas: falhar fechado é intencional | 2 testes PASS |
+| Dry-run precisa permanecer sem tráfego | Manter execução remota condicionada a `--execute` e preflight | Chamadas reais ainda exigem autorização/teste com instância isolada | 2 testes PASS |
+
+## Evidências desta revisão
+
+- `npm test` → **202 pass, 0 fail** (log `INBOXOS_FASE13_TEST_FINAL.log`).
+- `node scripts/audit-release-readiness.mjs` → **FAIL no lockfile**, exatamente seis divergências; **PASS** parse de 269 fontes TS/TSX/MTS, imports locais e 83 rotas; Billing protegido.
+- `npm ping` → `EAI_AGAIN`, sem registry no executor. **Não** houve `npm install`, `npm ci`, `npm run lint`, typecheck global, `npm run build` ou `build:gated` bem-sucedidos.
+- **Sem** upload de credencial, envio real Evolution, Groq/Resend real, deploy Netlify, migrations nem alteração de banco/backlog.
+
+## Prioridade da próxima rodada
+
+1. **G1-01**: em ambiente com acesso a `registry.npmjs.org`, gerar `package-lock.json` exclusivamente com npm oficial, revisar diff (dependências removidas/adicionadas), executar `npm ci` limpo.
+2. **G1-03 a G1-08**: executar teste, audit, lint, typecheck, build e build:gated no mesmo hash/commit. Não desligar gates para obter verde artificial.
+3. **G0-05 a G0-07**: criar banco Supabase staging distinto, Evolution sandbox, contas autorizadas e secrets somente em ambiente de teste. Conferir que Deploy Preview **efetivamente** conecta ao banco isolado; não basta preencher ENV.
+4. **G2-03/G2-04**: consultar schema **somente leitura** em staging para avaliar colisões de `external_id`; só depois coordenar UNIQUE, RPC e queries em migration versionada testada.
+5. **G3/G4/G5**: executar E01–E22 de Evolution, OTP/Auth, fila, outbox, Groq/Resend, UI, preview e rollback com logs redigidos. Não utilizar dados reais.
+6. **G6**: somente com evidências completas solicitar autorização separada para deploy em produção; qualquer reprocessamento histórico exige outra autorização.
+
+## Checklist completo com status e critérios
+
+### G0 — 4/7 PASS
+
+- [x] **G0-01 — Verificar integridade da base da Fase 11** | `PASS` | P0
+  - Corrige: Evitar continuar sobre pacote corrompido ou antigo. Risco: Mistura de versões, perda de correções.
+  - Critério PASS: ZIP abre sem erro e estrutura InboxOS identificada. Pré-requisito: —.
+  - Evidência: ZipFile.testzip(): OK; 439 entradas no pacote da Fase 11
+- [x] **G0-02 — Registrar snapshot imutável, hash e branch de trabalho** | `PASS` | P0
+  - Corrige: Permitir comparação e rollback do código. Risco: Sobrescrever trabalho atual ou aplicar patch duas vezes.
+  - Critério PASS: Git branch/snapshot e SHA256 do ZIP registrado. Pré-requisito: G0-01.
+  - Evidência: Snapshot ZIP imutável + diretório isolado; SHA256 aa64996f9c7ff2957e…; sem .git, não foi criada branch. docs/FASE12_SNAPSHOT_BASE_SHA256.md
+- [x] **G0-03 — Conferir runtime Node e npm da revisão** | `PASS` | P0
+  - Corrige: Fixar ambiente de build reprodutível. Risco: Versões diferentes geram dependências incompatíveis.
+  - Critério PASS: Node >=22.12.0 e npm 10.9.2 identificados. Pré-requisito: —.
+  - Evidência: Node v22.16.0 / npm v10.9.2
+- [x] **G0-04 — Confirmar Billing desligado no código** | `PASS` | P0
+  - Corrige: Não ativar fluxo de cobrança fora de escopo. Risco: Assinaturas ou rotas financeiras expostas sem homologação.
+  - Critério PASS: audit:release confirma proteção de Billing OFF. Pré-requisito: —.
+  - Evidência: PASS em auditoria 11/10/2026; flags de deploy ainda pendentes
+- [ ] **G0-05 — Preparar Supabase staging com project ref distinto** | `BLOCKED` | P0
+  - Corrige: Evitar escrever no banco de produção durante E2E. Risco: Dano em dados reais e migração irreversível.
+  - Critério PASS: Ref de staging e credenciais segregadas comprovadas. Pré-requisito: G0-02.
+  - Evidência: Staging não fornecido
+- [ ] **G0-06 — Preparar Evolution v2 + contas de teste autorizadas** | `BLOCKED` | P0
+  - Corrige: Garantir troca de mensagens sem atingir clientes. Risco: Mensagens e webhooks atingirem produção.
+  - Critério PASS: Instância e números exclusivos para testes, separados do produção. Pré-requisito: G0-05.
+  - Evidência: Ambiente de teste não fornecido
+- [ ] **G0-07 — Configurar segredos e contexto de preview sem valores em logs** | `BLOCKED` | P0
+  - Corrige: Separar serviço, vault e client env. Risco: Vazamento de service_role, API keys, tokens ou redirecionamento.
+  - Critério PASS: ENV presentes no secret store, sem valores expostos; preview aponta somente para staging. Pré-requisito: G0-05.
+  - Evidência: ENV reais indisponíveis
+
+### G1 — 1/9 PASS
+
+- [ ] **G1-01 — Corrigir seis divergências de package-lock com npm oficial** | `FAIL` | P0
+  - Corrige: Restabelecer resolução determinística de dependências. Risco: Atualizações transitivas inesperadas ou quebra do adaptador Netlify.
+  - Critério PASS: npm install --package-lock-only; diff revisado; audit:release sem divergências. Pré-requisito: G0-02.
+  - Evidência: npm view @netlify/vite-plugin-tanstack-start@1.3.19 → EAI_AGAIN; lockfile não alterado; continuam 6 divergências.
+- [ ] **G1-02 — Executar npm ci em instalação limpa** | `BLOCKED` | P0
+  - Corrige: Comprovar que dependências se instalam a partir do lock. Risco: Optional deps incompatíveis ou download parcial.
+  - Critério PASS: npm ci --include=dev --include=optional sai 0. Pré-requisito: G1-01.
+  - Evidência: Registry npm inacessível (EAI_AGAIN); npm ci sem PASS neste ambiente.
+- [x] **G1-03 — Reexecutar testes unitários e regressão** | `PASS` | P0
+  - Corrige: Garantir que hotfixes existentes não regrediram. Risco: Novo pacote poderia alterar fixtures ou carregadores.
+  - Critério PASS: npm test na versão final Fase 12 retorna 195/195; repetir após corrigir lockfile. Pré-requisito: G0-01.
+  - Evidência: Fase 12, npm test: 195/195 PASS (189+6); log INBOXOS_FASE12_TEST_2026-10-11.log. Repetir após reparo do lock.
+- [ ] **G1-04 — Auditoria release: parsing, imports, rotas, Billing e lockfile** | `FAIL` | P0
+  - Corrige: Confirmar integridade estrutural antes da compilação. Risco: Ignorar falhas restantes por falso positivo.
+  - Critério PASS: npm run audit:release retorna 0 em TODAS as checagens. Pré-requisito: G1-01.
+  - Evidência: Fase12: audit:release FAIL 6 divergências no lock; PASS parser 269 TS, 83 rotas, imports e Billing OFF.
+- [ ] **G1-05 — Rodar ESLint completo sem afrouxar regras** | `BLOCKED` | P0
+  - Corrige: Detectar riscos de React/hooks e qualidade. Risco: Silenciar linter esconde bugs reais.
+  - Critério PASS: npm run lint retorna 0 sem redução das regras. Pré-requisito: G1-02.
+- [ ] **G1-06 — Rodar TypeScript completo** | `BLOCKED` | P0
+  - Corrige: Detectar contratos e tipos incompatíveis. Risco: Casts inseguros escondem erros.
+  - Critério PASS: npx --no-install tsc --noEmit retorna 0. Pré-requisito: G1-02.
+- [ ] **G1-07 — Executar build Vite e verificar artefatos** | `BLOCKED` | P0
+  - Corrige: Comprovar compilação para produção. Risco: Problemas SSR/hydration/rotas ainda ocultos.
+  - Critério PASS: npm run build retorna 0 e gera cliente + handlers previstos. Pré-requisito: G1-05,G1-06.
+- [ ] **G1-08 — Executar build:gated Netlify na mesma revisão** | `BLOCKED` | P0
+  - Corrige: Comprovar todos os gates juntos. Risco: CI aceitar revisão diferente da testada.
+  - Critério PASS: npm run build:gated retorna 0 e commit/hash registrados. Pré-requisito: G1-03,G1-04,G1-05,G1-06,G1-07.
+- [ ] **G1-09 — Conferir mudanças do lockfile e fixar versões realmente necessárias** | `NOT RUN` | P1
+  - Corrige: Reduzir supply-chain drift e divergências não intencionais. Risco: Atualização silenciosa de dependências e APIs.
+  - Critério PASS: Diff limitado ao necessário, deps diretas alinhadas, nenhuma integridade inventada. Pré-requisito: G1-01.
+
+### G2 — 2/13 PASS
+
+- [ ] **G2-01 — Inventariar migrations e schema somente leitura** | `BLOCKED` | P0
+  - Corrige: Evitar executar DDL incompatível com estado real. Risco: Migrations antigas podem reaplicar SQL/trigger.
+  - Critério PASS: Inventário de staging e divergências documentados. Pré-requisito: G0-05.
+- [ ] **G2-02 — Verificar UNIQUE/onConflict de contatos e presença** | `BLOCKED` | P0
+  - Corrige: Prevenir SQL 42P10 e duplicação. Risco: Índice novo conflitar com registros históricos.
+  - Critério PASS: Constraints staging correspondem às queries e fixtures E04/E07. Pré-requisito: G2-01.
+- [ ] **G2-03 — Analisar colisões external_id em mensagens multi-instância** | `BLOCKED` | P0
+  - Corrige: Eliminar deduplicação cruzada dentro do workspace. Risco: Alterar chave incorretamente pode perder dados ou multiplicar mensagens.
+  - Critério PASS: Consulta read-only prova se há colisões e define migração versionada. Pré-requisito: G2-01.
+  - Evidência: Diagnóstico SQL somente leitura preparado em scripts/sql; não executado sem staging. Índices/RPC legados analisados offline.
+- [ ] **G2-04 — Projetar migração atômica de chave (workspace,instance,external)** | `NOT RUN` | P0
+  - Corrige: Corrigir unicidade por instância quando schema/consultas confirmarem. Risco: Índice, RPC e queries não podem ser alterados isoladamente.
+  - Critério PASS: Plano com pré-checagem, migração, compatibilidade, rollback e teste concorrente. Pré-requisito: G2-03.
+  - Evidência: Esboço documentado em docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md. Migração SQL NÃO executada/criada; depende de staging real.
+- [ ] **G2-05 — Testar RPC persist_inbox_message e buscas por instância** | `BLOCKED` | P0
+  - Corrige: Evitar gravar ou editar mensagem na instância errada. Risco: Risco de regressão em upsert histórico, deletes e recibos.
+  - Critério PASS: Mesmo ID externo em duas instâncias não cruza dados nem duplica na mesma. Pré-requisito: G2-04.
+- [ ] **G2-06 — Reconciliar histórico e rodar migrations SOMENTE em staging** | `BLOCKED` | P0
+  - Corrige: Validar reversibilidade e estado final do banco. Risco: DDL parcial, triggers duplicadas e bloqueios.
+  - Critério PASS: Migrations de staging verdes, sem drift e rollback testado. Pré-requisito: G2-01,G2-02,G2-04.
+- [ ] **G2-07 — Executar testes RLS com dois workspaces, duas instâncias** | `BLOCKED` | P0
+  - Corrige: Comprovar isolamento verdadeiro além dos mocks. Risco: Cross-tenant por service_role, join ou IDOR.
+  - Critério PASS: Dados A inacessíveis a B em chats, mídia, CRM, convite, agentes e exports. Pré-requisito: G2-06.
+- [ ] **G2-08 — Concorrência do último owner/superadmin** | `BLOCKED` | P0
+  - Corrige: Preservar ao menos um proprietário/administrador ativo. Risco: Race condition pode remover último privilegiado.
+  - Critério PASS: Duas transações simultâneas não deixam zero privilegiados ativos. Pré-requisito: G2-06.
+- [ ] **G2-09 — Validar transferência owner e revogação/suspensão** | `BLOCKED` | P0
+  - Corrige: Garantir autorização atômica e sessões inválidas. Risco: Permissões ficam no cache após mudança.
+  - Critério PASS: Transferência correta; token revogado/suspenso recebe negativa no request seguinte. Pré-requisito: G2-06.
+- [ ] **G2-10 — Auditar bucket, assinatura de mídia e vault das integrações** | `BLOCKED` | P0
+  - Corrige: Prevenir leak de imagem e credencial multi-tenant. Risco: URL assinada expõe recurso ou token em frontend.
+  - Critério PASS: Apenas owner autorizado acessa mídia e segredos ficam server-side. Pré-requisito: G2-07.
+- [ ] **G2-11 — Testar backup e restauração em staging** | `BLOCKED` | P0
+  - Corrige: Garantir rollback de schema/dados sem improviso. Risco: Recuperação não funcionar em incidente.
+  - Critério PASS: Backup/PITR demonstrado em ambiente de teste com tempos registrados. Pré-requisito: G2-06.
+- [x] **G2-12 — Blindar mutações Evolution por instance_id no código** | `PASS` | P0
+  - Corrige: Evitar edições, exclusões, reações e fotos cross-instance em mesmo workspace. Risco: Caller legada sem instance_id falha fechada; E2E e schema ainda não homologados.
+  - Critério PASS: Guard obrigatório + filtros em buscas/updates + regressões offline aprovadas. Pré-requisito: G0-02.
+  - Evidência: 4 novos testes evolução instance scope PASS; edições de evolution.server.ts e sync-engine.ts; sem alterações de banco
+- [x] **G2-13 — Preparar SQL de diagnóstico read-only e projeto de migração** | `PASS` | P0
+  - Corrige: Prevenir alteração insegura da UNIQUE antiga e planejar migração coordenada. Risco: Consulta em staging pode evidenciar divergências; análise offline não prova ausência de colisões.
+  - Critério PASS: SQL sem DML/DDL + documento de pré-checagem/migração/rollback + testes estáticos. Pré-requisito: G0-02.
+  - Evidência: scripts/sql/inspect-message-identity-readonly.sql + docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md; 2 testes PASS; staging NOT RUN
+
+### G3 — 1/13 PASS
+
+- [ ] **G3-01 — Homologar auth: cadastro, login, OTP, recuperação e sessões** | `BLOCKED` | P0
+  - Corrige: Comprovar fluxos críticos de identidade. Risco: OTP reutilizável ou sessões não revogadas.
+  - Critério PASS: HTTP 200/201, 401/403/409 conforme cenário; tokens expirados inválidos. Pré-requisito: G2-07,G1-08.
+- [ ] **G3-02 — Testar papéis ADM e membros, convites e suspensão** | `BLOCKED` | P0
+  - Corrige: Evitar escalada de privilégio e ações cruzadas. Risco: Rota ADM sem guard ou papel em cache.
+  - Critério PASS: Papéis enforcement no servidor em todas as mutações. Pré-requisito: G3-01.
+- [ ] **G3-03 — Testar ingress webhook: token, JSON, payload, rate-limit** | `BLOCKED` | P0
+  - Corrige: Garantir fail-closed do endpoint público. Risco: Aceitação indevida/consumo excessivo.
+  - Critério PASS: Casos 400/401/413/429/503 esperados sem efeitos colaterais. Pré-requisito: G2-06,G1-08.
+- [ ] **G3-04 — Comprovar persistência e idempotência do webhook** | `BLOCKED` | P0
+  - Corrige: Garantir queued→completed e não apenas HTTP 2xx. Risco: Duplicatas e falso sucesso em falha Supabase.
+  - Critério PASS: Mesmo evento produz uma escrita e status coerente; erros viram failed/retry. Pré-requisito: G3-03.
+- [ ] **G3-05 — Simular worker concorrente / CAS / dead-letter** | `BLOCKED` | P0
+  - Corrige: Confirmar hotfix da Fase 11 sob concorrência. Risco: Mais retries podem aumentar fila em indisponibilidade.
+  - Critério PASS: Somente worker com claim conclui; falhas de DB não finalizam evento. Pré-requisito: G3-04.
+- [ ] **G3-06 — Revalidar recovery cron e limites de lote** | `BLOCKED` | P0
+  - Corrige: Recuperar evento preso sem tempestade de execução. Risco: Backfill agressivo causa duplicatas ou resposta IA retroativa.
+  - Critério PASS: Stale processing/failed recuperados sob política; nenhuma resposta retroativa. Pré-requisito: G3-05.
+- [ ] **G3-07 — Testar outbox com dois envios do mesmo clientMessageId** | `BLOCKED` | P0
+  - Corrige: Evitar mensagens duplicadas em race. Risco: Dois workers enviam simultaneamente.
+  - Critério PASS: Apenas um envio remoto/aceitação com mesma chave idempotente. Pré-requisito: G3-05.
+- [ ] **G3-08 — Testar timeout/408/5xx e reconciliação sem reenvio** | `BLOCKED` | P0
+  - Corrige: Evitar retry cego quando resultado remoto é ambíguo. Risco: Mensagem enviada duas vezes.
+  - Critério PASS: Estado unknown/accepted reconciliado por IDs, sem novo disparo. Pré-requisito: G3-07.
+- [ ] **G3-09 — Validar mutation: edição/exclusão/reação/recibos** | `BLOCKED` | P0
+  - Corrige: Evitar edição ou alteração de status da mensagem errada. Risco: Eventos atrasados regridem status ou cruzam instâncias.
+  - Critério PASS: Mensagem correta, ordem preservada, READ não regrede. Pré-requisito: G3-04.
+- [ ] **G3-10 — Validar contatos, chats, grupos e permissões sob E2E** | `BLOCKED` | P0
+  - Corrige: Comprovar hotfix de grupos/cache em produção isolada. Risco: Cache stale e permissões indevidas em eventos fora de ordem.
+  - Critério PASS: Mesmo JID em 2 workspaces/instâncias não contamina metadados. Pré-requisito: G3-04,G2-07.
+- [ ] **G3-11 — Testar uploads, mídias e recibos com permissões** | `BLOCKED` | P1
+  - Corrige: Garantir fluxo de arquivos e acesso correto. Risco: Payload acima do limite, assinatura inválida, upload indevido.
+  - Critério PASS: Arquivos permitidos passam e inválidos falham sem escrita pública. Pré-requisito: G2-10,G3-09.
+- [ ] **G3-12 — Cobrir contratos HTTP restantes com matriz de smoke** | `BLOCKED` | P1
+  - Corrige: Detectar endpoints quebrados após migrações. Risco: Rotas com 500 apesar de build verde.
+  - Critério PASS: Contratos críticos 2xx/4xx previsíveis e sem 500/tenant leak. Pré-requisito: G3-01,G3-04.
+- [x] **G3-13 — Blindar execução de smoke sintético Evolution no preview** | `PASS` | P0
+  - Corrige: Evitar POSTs sintéticos em produção, banco errado ou com respostas automáticas habilitadas. Risco: Confirmações do operador não provam a configuração efetiva do Deploy Preview; exigir verificação externa.
+  - Critério PASS: Preflight fail-closed, segredos não logados, dry-run sem rede e regressões locais aprovadas. Pré-requisito: G0-02.
+  - Evidência: scripts/lib/evolution-smoke-policy.mjs + 7 novos testes PASS (202/202 no total); execução remota NOT RUN
+
+### G4 — 0/8 PASS
+
+- [ ] **G4-01 — Confirmar versão/contrato real da Evolution API v2** | `BLOCKED` | P0
+  - Corrige: Evitar incompatibilidade de payloads/eventos. Risco: Documentação de versão diferente mascarar falhas.
+  - Critério PASS: Versão instalada e endpoints de webhook/QR validados. Pré-requisito: G0-06.
+- [ ] **G4-02 — Testar QR, conexão, desconexão e reconexão** | `BLOCKED` | P0
+  - Corrige: Comprovar lifecycle de conexão do painel. Risco: Reconfigurar instância produtiva por engano.
+  - Critério PASS: Somente instância sandbox muda; UI, API e banco concordam. Pré-requisito: G4-01,G5-01.
+- [ ] **G4-03 — Testar contatos @lid, grupos e atualização de participantes** | `BLOCKED` | P0
+  - Corrige: Comprovar nome/foto, isolamento e canSend. Risco: Grupos abertos serem tratados como bloqueados.
+  - Critério PASS: Cenários E04–E07/E12/E13 verdes com Evolution real. Pré-requisito: G4-01,G3-10.
+- [ ] **G4-04 — Testar envio/recebimento e status de mensagens reais** | `BLOCKED` | P0
+  - Corrige: Comprovar E2E de mensagens. Risco: Envio não persistir ou ser duplicado.
+  - Critério PASS: Painel, banco e WhatsApp sandbox concordam com IDs/estado. Pré-requisito: G4-02,G3-08.
+- [ ] **G4-05 — Testar mídia, edição, exclusão, reação e recibos** | `BLOCKED` | P0
+  - Corrige: Cobrir eventos pouco testados. Risco: Falha silenciosa em mensagens alteradas.
+  - Critério PASS: E08–E11/E20 aprovados e rastreados. Pré-requisito: G4-04.
+- [ ] **G4-06 — Validar Groq sandbox, timeout e mensagens antigas** | `BLOCKED` | P1
+  - Corrige: Evitar resposta automática retroativa. Risco: Resposta do agente para backlog antigo.
+  - Critério PASS: IA não responde a eventos antigos ou duplicados. Pré-requisito: G4-04.
+- [ ] **G4-07 — Validar Resend: OTP, recuperação e falha de entrega** | `BLOCKED` | P0
+  - Corrige: Assegurar login e alertas. Risco: OTP não entregue ou reenviado em cascata.
+  - Critério PASS: Emails chegam somente a caixas de teste, falhas tratadas. Pré-requisito: G3-01.
+- [ ] **G4-08 — Validar newsletter com opt-in/opt-out em sandbox** | `BLOCKED` | P1
+  - Corrige: Evitar envios e dados de marketing incorretos. Risco: Newsletter real enviada sem autorização.
+  - Critério PASS: Agendamento/cancelamento/descadastro corretos em lista teste. Pré-requisito: G4-07.
+
+### G5 — 0/9 PASS
+
+- [ ] **G5-01 — Publicar Deploy Preview com ENV isoladas** | `BLOCKED` | P0
+  - Corrige: Simular produção sem risco a clientes. Risco: Preview apontar Supabase/Evolution produtivos.
+  - Critério PASS: URL preview, env do contexto e ref staging comprovados. Pré-requisito: G1-08,G0-05,G0-06,G0-07.
+- [ ] **G5-02 — Bloquear escrita de webhook de produção em preview** | `BLOCKED` | P0
+  - Corrige: Impedir alterações de webhook da instância real. Risco: Mensagem da produção roteada a preview.
+  - Critério PASS: EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=false; checagens de host e ref OK. Pré-requisito: G5-01.
+- [ ] **G5-03 — Rodar audit:env sem revelar segredos** | `BLOCKED` | P0
+  - Corrige: Comprovar vault/bootstrap/billing/env. Risco: Bootstrap admin ativo ou chave inválida.
+  - Critério PASS: npm run audit:env PASS no contexto escolhido. Pré-requisito: G5-01.
+- [ ] **G5-04 — Rodar synthetic smoke em dry-run e execução segura** | `BLOCKED` | P0
+  - Corrige: Comprovar ingress por endereço público. Risco: Ensaio atingir produção ou ser tomado por E2E completo.
+  - Critério PASS: Dry-run OK + --execute somente preview, status persistido no staging. Pré-requisito: G5-02,G3-04.
+- [ ] **G5-05 — Executar test:integration e testes HTTP na URL preview** | `BLOCKED` | P0
+  - Corrige: Detectar rotas quebradas de deploy. Risco: Resposta de mock diferente do runtime Netlify.
+  - Critério PASS: TEST_BASE_URL preview; suíte de integração verde. Pré-requisito: G5-04,G3-12.
+- [ ] **G5-06 — Conferir responsividade e interações 320–desktop** | `BLOCKED` | P1
+  - Corrige: Prevenir bugs de viewport e teclado. Risco: Modais e rolagem podem travar no mobile.
+  - Critério PASS: Flows de auth, inbox, CRM e ADM sem overflow/console errors. Pré-requisito: G5-01.
+- [ ] **G5-07 — Testar cache, reconexão e falhas parciais de rede** | `BLOCKED` | P1
+  - Corrige: Garantir que UI não mostre falso sucesso. Risco: Estado stale e envio duplicado por clique.
+  - Critério PASS: Erros claros, retries seguros e dados atualizados após refresh. Pré-requisito: G5-05.
+- [ ] **G5-08 — Instrumentar fila, erros 5xx, cron e logs redigidos** | `BLOCKED` | P0
+  - Corrige: Detectar falha antes de atingir clientes. Risco: Backlog cresce silenciosamente.
+  - Critério PASS: Métricas queued/failed/dead_letter, logs sem PII e alerta funcional. Pré-requisito: G5-04.
+- [ ] **G5-09 — Testar rollback do deploy e restauração da operação** | `BLOCKED` | P0
+  - Corrige: Reduzir tempo de recuperação após incidente. Risco: Rollback de app incompatível com schema alterado.
+  - Critério PASS: Volta de preview reproduzida sem perder eventos. Pré-requisito: G2-11,G5-05.
+
+### G6 — 0/7 PASS
+
+- [ ] **G6-01 — Consolidar relatório de gates em uma revisão e evidências** | `NOT RUN` | P0
+  - Corrige: Evitar aprovar commit diferente daquele testado. Risco: Testes de revisões distintas geram falso GO.
+  - Critério PASS: G1–G5 comprovados no mesmo SHA, logs redigidos e datados. Pré-requisito: G1-08,G2-11,G5-09.
+- [ ] **G6-02 — Auditar backlog real SOMENTE leitura após release validado** | `BLOCKED` | P0
+  - Corrige: Estimar recuperação segura dos eventos acumulados. Risco: Reprocessar eventos antigos gera duplicação/IA retroativa.
+  - Critério PASS: Contagens e causas atuais conhecidas, sem write em produção. Pré-requisito: G6-01.
+  - Evidência: Snapshot 02/10 é histórico, não atualizado
+- [ ] **G6-03 — Definir decisão GO/NO-GO e plano canário** | `BLOCKED` | P0
+  - Corrige: Controlar risco de publicação. Risco: Lançamento com fila falhando ou rollback ausente.
+  - Critério PASS: Todos G1–G5 PASS e nenhum bloqueio crítico. Pré-requisito: G6-01.
+- [ ] **G6-04 — Obter autorização explícita específica para produção** | `BLOCKED` | P0
+  - Corrige: Evitar mudanças não autorizadas. Risco: Deploy afeta clientes e dados reais.
+  - Critério PASS: Aprovação do responsável registrada APÓS homologação. Pré-requisito: G6-03.
+  - Evidência: Não autorizado
+- [ ] **G6-05 — Publicar versão em produção com canário monitorado** | `BLOCKED` | P0
+  - Corrige: Disponibilizar correções comprovadas. Risco: Regressão ao vivo e picos de fila.
+  - Critério PASS: Deploy autorizado, health+fila estabilizados, rollback disponível. Pré-requisito: G6-04.
+- [ ] **G6-06 — Solicitar autorização distinta para replay do backlog** | `BLOCKED` | P0
+  - Corrige: Impedir disparo retroativo de milhares de eventos. Risco: Mensagens/IA duplicadas, custo e rate limit.
+  - Critério PASS: Canário pequeno definido, revisão manual e autorização específica. Pré-requisito: G6-02,G6-05.
+  - Evidência: Não autorizado
+- [ ] **G6-07 — Executar replay seletivo canário e reavaliar métricas** | `BLOCKED` | P0
+  - Corrige: Recuperar eventos com segurança. Risco: Backlog e mensagens podem ser amplificados.
+  - Critério PASS: Sem duplicatas, métricas estáveis; sem batch integral. Pré-requisito: G6-06.
+
+## Critério final GO/NO-GO
+
+**NO-GO enquanto:** lockfile não regenerado pela ferramenta oficial, `npm ci`/build não aprovados, staging real não isolado, E2E não aprovados, RLS/conflitos de instância não verificados, rollback não ensaiado ou sem autorização de produção. O status G3-13 PASS significa **somente** preflight local, não E2E remoto.
+
+### Pré-execução segura do smoke (apenas após preparar staging)
+
+```bash
+node scripts/evolution-preview-smoke.mjs  # sempre DRY RUN primeiro
+# No secret store, definir EVOLUTION_STAGING_WEBHOOK_URL e TOKEN,
+# EVOLUTION_STAGING_INSTANCE, EVOLUTION_STAGING_SUPABASE_REF,
+# EVOLUTION_PRODUCTION_SUPABASE_REF, PRODUCTION_APP_URL,
+# STAGING_ISOLATED_DB_CONFIRMED=yes,
+# STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes
+# Após conferir hospedagem, banco e agentes em staging:
+node scripts/evolution-preview-smoke.mjs --execute
+```
+
+Não copiar tokens em scripts, planilhas ou relatórios. Nenhum `HTTP 2xx` confirma escrita persistida: validar os eventos no banco do staging.
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
--- a/scripts/evolution-preview-smoke.mjs
+++ b/scripts/evolution-preview-smoke.mjs
@@ -1,25 +1,21 @@
 #!/usr/bin/env node
 /** Explicit, permissioned synthetic Evolution webhook smoke test.
  * Default mode is dry-run; --execute only permits Netlify Deploy Preview with
- * separately confirmed non-production Supabase. Never sends WhatsApp messages.
+ * separately confirmed non-production Supabase AND disabled auto-replies.
+ * Does not directly send WhatsApp messages, but inbound events can trigger agents.
  * Exit 0 confirms HTTP receipt, NOT durable processing or a live WhatsApp send.
  */
 import { randomUUID } from "node:crypto";
+import { validateEvolutionSmokeEnvironment } from "./lib/evolution-smoke-policy.mjs";
 
 const execute = process.argv.includes("--execute");
-const urlRaw = process.env.EVOLUTION_STAGING_WEBHOOK_URL || "";
-const instance = process.env.EVOLUTION_STAGING_INSTANCE || "";
-const projectRef = process.env.EVOLUTION_STAGING_SUPABASE_REF || "";
-const productionRef = "aczstooavclxhmgtsobg";
-const secret = process.env.EVOLUTION_STAGING_WEBHOOK_TOKEN || "";
-const sandboxConfirmed = process.env.STAGING_ISOLATED_DB_CONFIRMED === "yes";
-let url;
-try { url = new URL(urlRaw); } catch { /* incomplete environment stays dry-run */ }
-const preview = Boolean(url && url.protocol === "https:" && /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/i.test(url.hostname)
-  && url.pathname === "/api/public/webhooks/evolution" && !url.search && !url.hash && !url.username && !url.password);
+const validation = execute ? validateEvolutionSmokeEnvironment(process.env) : null;
+const url = validation?.url;
+const instance = process.env.EVOLUTION_STAGING_INSTANCE;
+const secret = process.env.EVOLUTION_STAGING_WEBHOOK_TOKEN;
 const id = randomUUID();
-// These IDs are synthetic. The messageTimestamp is one day old so Groq may not
-// auto-reply even when an old event is accidentally replayed.
+// These IDs are synthetic. The timestamp is old, but it does NOT prevent all
+// automations from reacting; execute requires auto-replies disabled in staging.
 const testJid = "15550001111@s.whatsapp.net";
 const messages = [
   { event: "CONTACTS_UPDATE", data: { remoteJid: testJid, pushName: "InboxOS Smoke", profilePictureUrl: "" } },
@@ -32,12 +28,12 @@
 ];
 console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}. Synthetic events: ${messages.map(m => m.event).join(", ")}`);
 if (!execute) {
-  console.log("Dry run: zero network requests. To execute: use a dedicated Netlify Deploy Preview, isolated Supabase staging, test instance, webhook token, and --execute.");
+  console.log("Dry run: zero network requests. To execute: confirm preview, isolated Supabase staging, production ref, test instance, disabled auto-replies and --execute.");
   process.exit(0);
 }
-if (!preview || !instance || !/^[a-z0-9_-]{3,80}$/i.test(instance) || !secret || projectRef.length < 12 ||
-  projectRef === productionRef || !sandboxConfirmed) {
-  console.error("BLOCKED: requires https://deploy-preview-N--APP.netlify.app/api/public/webhooks/evolution, non-production Supabase ref, explicit isolated DB confirmation, dedicated test instance, and webhook token.");
+if (!validation?.valid || !url) {
+  // Only names and generic error descriptions; no tokens, numbers or payloads.
+  for (const error of validation?.errors ?? []) console.error(`BLOCKED: ${error}`);
   process.exit(2);
 }
 let failed = 0;
--- /dev/null
+++ b/scripts/lib/evolution-smoke-policy.mjs
@@ -0,0 +1,64 @@
+/**
+ * Fail-closed preflight for a synthetic Evolution webhook smoke test.
+ * Pure: does not read secrets from logs, make network calls or modify a DB.
+ * Environment declarations cannot independently prove a preview's DB wiring;
+ * operators must verify the target in the hosting dashboard before executing.
+ */
+const historicalProductionRef = 'aczstooavclxhmgtsobg';
+const projectRefPattern = /^[a-z0-9]{20}$/;
+const previewHostPattern = /^deploy-preview-[1-9][0-9]*--[a-z0-9-]+\.netlify\.app$/;
+
+export function validateEvolutionSmokeEnvironment(env) {
+  const errors = [];
+  let url;
+  try { url = new URL(String(env.EVOLUTION_STAGING_WEBHOOK_URL ?? '')); }
+  catch { errors.push('EVOLUTION_STAGING_WEBHOOK_URL: URL inválida'); }
+
+  if (url && (url.protocol !== 'https:' || !previewHostPattern.test(url.hostname) ||
+    url.pathname !== '/api/public/webhooks/evolution' || url.search || url.hash ||
+    url.username || url.password || url.port)) {
+    errors.push('EVOLUTION_STAGING_WEBHOOK_URL: exige HTTPS e rota exata de Deploy Preview isolado');
+  }
+
+  const instance = String(env.EVOLUTION_STAGING_INSTANCE ?? '');
+  if (!/^[a-z0-9_-]{3,80}$/i.test(instance)) {
+    errors.push('EVOLUTION_STAGING_INSTANCE: nome de instância de teste inválido');
+  }
+  if (String(env.EVOLUTION_STAGING_WEBHOOK_TOKEN ?? '').trim().length < 16) {
+    errors.push('EVOLUTION_STAGING_WEBHOOK_TOKEN: deve conter no mínimo 16 caracteres');
+  }
+
+  const stagingRef = String(env.EVOLUTION_STAGING_SUPABASE_REF ?? '');
+  const productionRef = String(env.EVOLUTION_PRODUCTION_SUPABASE_REF ?? '');
+  if (!projectRefPattern.test(stagingRef)) {
+    errors.push('EVOLUTION_STAGING_SUPABASE_REF: project ref de staging inválido');
+  }
+  if (!projectRefPattern.test(productionRef)) {
+    errors.push('EVOLUTION_PRODUCTION_SUPABASE_REF: declarar explicitamente o project ref de produção');
+  }
+  if (stagingRef && (stagingRef === productionRef || stagingRef === historicalProductionRef)) {
+    errors.push('EVOLUTION_STAGING_SUPABASE_REF: coincide com referência protegida de produção');
+  }
+
+  let productionOrigin;
+  try {
+    const production = new URL(String(env.PRODUCTION_APP_URL ?? ''));
+    if (production.protocol !== 'https:' || production.username || production.password || !production.hostname.includes('.')) {
+      throw new Error('not public HTTPS');
+    }
+    productionOrigin = production.origin;
+  } catch {
+    errors.push('PRODUCTION_APP_URL: URL HTTPS de produção é obrigatória para comparação');
+  }
+  if (url && productionOrigin && url.origin === productionOrigin) {
+    errors.push('EVOLUTION_STAGING_WEBHOOK_URL: a origem coincide com produção');
+  }
+  if (env.STAGING_ISOLATED_DB_CONFIRMED !== 'yes') {
+    errors.push('STAGING_ISOLATED_DB_CONFIRMED: verificar conexão do Preview ao banco de teste');
+  }
+  if (env.STAGING_AUTOREPLY_DISABLED_CONFIRMED !== 'yes') {
+    errors.push('STAGING_AUTOREPLY_DISABLED_CONFIRMED: desabilitar agentes e respostas automáticas antes de injetar mensagens');
+  }
+  // Return only the URL and a boolean. Never return/copy the webhook secret.
+  return { valid: errors.length === 0, errors, url: errors.length ? undefined : url };
+}
--- /dev/null
+++ b/tests/evolution-preview-safety.test.ts
@@ -0,0 +1,73 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { spawnSync } from 'node:child_process';
+import { validateEvolutionSmokeEnvironment } from '../scripts/lib/evolution-smoke-policy.mjs';
+
+const env = {
+  EVOLUTION_STAGING_WEBHOOK_URL: 'https://deploy-preview-41--inboxos.netlify.app/api/public/webhooks/evolution',
+  EVOLUTION_STAGING_INSTANCE: 'smoke-test-01',
+  EVOLUTION_STAGING_WEBHOOK_TOKEN: 'synthetic-staging-token-123456',
+  EVOLUTION_STAGING_SUPABASE_REF: 'bbbbbbbbbbbbbbbbbbbb',
+  EVOLUTION_PRODUCTION_SUPABASE_REF: 'aaaaaaaaaaaaaaaaaaaa',
+  PRODUCTION_APP_URL: 'https://app.inboxos.example',
+  STAGING_ISOLATED_DB_CONFIRMED: 'yes',
+  STAGING_AUTOREPLY_DISABLED_CONFIRMED: 'yes',
+};
+
+test('synthetic webhook smoke accepts only explicitly confirmed isolated preview', () => {
+  const result = validateEvolutionSmokeEnvironment(env);
+  assert.equal(result.valid, true);
+  assert.equal(result.url?.hostname, 'deploy-preview-41--inboxos.netlify.app');
+  assert.equal(JSON.stringify(result).includes(env.EVOLUTION_STAGING_WEBHOOK_TOKEN), false);
+});
+
+test('webhook smoke rejects production ref, including the historically documented one', () => {
+  assert.equal(validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_SUPABASE_REF: env.EVOLUTION_PRODUCTION_SUPABASE_REF }).valid, false);
+  assert.equal(validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_SUPABASE_REF: 'aczstooavclxhmgtsobg' }).valid, false);
+  assert.equal(validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_PRODUCTION_SUPABASE_REF: '' }).valid, false);
+});
+
+test('webhook smoke refuses missing isolation or disabled-autoreply confirmations', () => {
+  for (const key of ['STAGING_ISOLATED_DB_CONFIRMED', 'STAGING_AUTOREPLY_DISABLED_CONFIRMED'] as const) {
+    const result = validateEvolutionSmokeEnvironment({ ...env, [key]: '' });
+    assert.equal(result.valid, false);
+    assert.ok(result.errors.some(x => x.includes(key)));
+  }
+});
+
+test('webhook smoke refuses URL tricks, non-preview sites and non-exact paths', () => {
+  const forbidden = [
+    'https://deploy-preview-0--inboxos.netlify.app/api/public/webhooks/evolution',
+    'https://inboxos.netlify.app/api/public/webhooks/evolution',
+    'https://deploy-preview-41--inboxos.netlify.app.evil.invalid/api/public/webhooks/evolution',
+    'http://deploy-preview-41--inboxos.netlify.app/api/public/webhooks/evolution',
+    'https://user:pass@deploy-preview-41--inboxos.netlify.app/api/public/webhooks/evolution',
+    'https://deploy-preview-41--inboxos.netlify.app/api/public/webhooks/evolution?token=abc',
+    'https://deploy-preview-41--inboxos.netlify.app/api/public/webhooks/evolution/extra',
+  ];
+  for (const raw of forbidden) assert.equal(validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_WEBHOOK_URL: raw }).valid, false, raw);
+});
+
+test('webhook smoke refuses short token and a production-origin match', () => {
+  assert.equal(validateEvolutionSmokeEnvironment({ ...env, EVOLUTION_STAGING_WEBHOOK_TOKEN: 'short' }).valid, false);
+  assert.equal(validateEvolutionSmokeEnvironment({ ...env, PRODUCTION_APP_URL: 'https://deploy-preview-41--inboxos.netlify.app' }).valid, false);
+});
+
+test('the default webhook smoke mode never makes requests or requires credentials', () => {
+  const proc = spawnSync(process.execPath, ['scripts/evolution-preview-smoke.mjs'], {
+    cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { PATH: process.env.PATH ?? '' }, timeout: 5000,
+  });
+  assert.equal(proc.status, 0);
+  assert.match(proc.stdout, /DRY RUN/);
+  assert.match(proc.stdout, /zero network requests/);
+});
+
+test('execute without staging credentials fails closed before network activity', () => {
+  const proc = spawnSync(process.execPath, ['scripts/evolution-preview-smoke.mjs', '--execute'], {
+    cwd: new URL('..', import.meta.url), encoding: 'utf8',
+    env: { PATH: process.env.PATH ?? '' }, timeout: 5000,
+  });
+  assert.equal(proc.status, 2);
+  assert.match(proc.stderr, /BLOCKED:/);
+  assert.doesNotMatch(proc.stdout, /HTTP 2\d\d/);
+});

```

### Histórico Fase 14

```diff
diff --git a/.agents/rules/inboxos-uiux-consistency.md b/.agents/rules/inboxos-uiux-consistency.md
new file mode 100644
--- /dev/null
+++ b/.agents/rules/inboxos-uiux-consistency.md
@@ -0,0 +1,12 @@
+---
+trigger: always_on
+description: "Regras de consistência visual e acessibilidade do InboxOS para qualquer alteração em telas, componentes, layouts ou CSS."
+---
+# Padrão UI/UX InboxOS (regra de workspace)
+- Use e siga a skill `.agents/skills/inboxos-premium-uiux/SKILL.md` ao alterar `src/styles.css`, `src/components/`, `src/features/` ou rotas de autenticação.
+- Preserve o produto multi-tenant, comportamento dos formulários, identidade visual Trax (neutros premium, vidro sutil, contraste adequado), icones Phosphor e conteúdo em português BR.
+- Não alterar APIs, auth, RLS, banco, cookies, Evolution, billing ou contratos do backend por uma demanda puramente visual.
+- Toda alteração deve ter objetivo, mudança mínima, potencial regressão, evidência local e teste de interação (mouse/teclado/touch).
+- Não declarar UI/UX '100% validada' sem screenshots reais no navegador nas larguras da skill e sem inspeção de console/network.
+- Não adicionar uma segunda família de ícones nem cores saturadas novas. Não esconder erros de formulário, indicadores de carregamento ou ações indisponíveis.
+- Se build/dependências estiverem bloqueados: executar as verificações offline e registrar `BLOCKED` para QA visual. Não forjar evidências.
diff --git a/.agents/skills/inboxos-backend-release/SKILL.md b/.agents/skills/inboxos-backend-release/SKILL.md
new file mode 100644
--- /dev/null
+++ b/.agents/skills/inboxos-backend-release/SKILL.md
@@ -0,0 +1,31 @@
+---
+name: inboxos-backend-release
+description: "Executa com segurança o handoff técnico do InboxOS para Codex/Antigravity: npm lockfile, CI, Netlify, Supabase staging, RLS, Evolution API, idempotência, filas, auth e gates de produção. Usar para correção de backend ou homologação, nunca como licença para operar produção."
+---
+# InboxOS backend & release — Skill para Antigravity/Codex
+
+## Pré-leitura inegociável
+1. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`
+2. `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`
+3. `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`
+4. `.agents/rules/evolution-staging.md` e `.agents/rules/supabase-production-safety.md`
+5. `package.json`, `package-lock.json`, scripts e migrações atuais
+
+## Execução ordenada
+- G0: checksum do ZIP/commit, branch de trabalho, inventário, segredos e refs de staging/produção redigidas.
+- G1: npm oficial -> corrigir lock -> `npm ci` -> unit -> lint -> TypeScript -> build -> gated build. SEM `--force`, `--legacy-peer-deps`, checksum inventado ou desativação do gate.
+- G2: Supabase **staging separado**, SELECT read-only primeiro, comparar schema real, migrações versionadas, RLS, concorrência e restores.
+- G3: API/handlers/queues/Evolution RPC com 2 tenants e 2 instâncias, respostas idempotentes, erros não mascarados.
+- G4: Evolution/Resend/Groq exclusivamente em sandbox; executar E01–E22; nenhum número de cliente real.
+- G5: Netlify Deploy Preview + HTTP smoke, QA visual via skill UI/UX, logs e testes negativos.
+- G6: decisão NO-GO até todos os P0 passarem; rollback e aprovação explícita para produção.
+
+## Não fazer
+- Nenhum `supabase db reset`/`db push`/`migration repair`, reprocessamento de backlog, reenvio, deploy/prod sem autorização e ambiente confirmado.
+- Nenhuma `service_role` no frontend, credencial no Git, secrets em log ou troca de permissões RLS para `USING(true)` para contornar erro.
+- Nenhum downgrade silencioso de TanStack/Netlify/Vite, alteração em massa de endpoints, fork de billing reativado, novo SDK não aprovado.
+- Nenhum `PASS` sem execução/log e nenhum patch deliberadamente sem teste de regressão.
+
+## Formato de saída por tarefa
+`ID | problema | causa evidenciada | arquivos | correção mínima | possível impacto | teste antigo | novo teste | evidência | PASS/FAIL/BLOCKED/NOT RUN | rollback`.
+Encerrar com tarefas abertas, blockers restantes, hash/branch e nenhum segredo.
diff --git a/.agents/skills/inboxos-premium-uiux/SKILL.md b/.agents/skills/inboxos-premium-uiux/SKILL.md
new file mode 100644
--- /dev/null
+++ b/.agents/skills/inboxos-premium-uiux/SKILL.md
@@ -0,0 +1,49 @@
+---
+name: inboxos-premium-uiux
+description: "Padroniza UI/UX premium e responsiva do InboxOS, com glassmorphism discreto, tipografia legível, acessibilidade, alinhamento entre telas, testes visuais e prevenção de regressões. Usar ao alterar React, Tailwind, CSS, sidebar, inbox, auth, dashboard, CRM ou modais."
+---
+# InboxOS premium UI/UX — Skill de implementação e revisão
+
+## Quando ativar
+- Ao criar/corrigir componentes `src/components/ui`, `src/features`, `src/routes/auth` ou `src/styles.css`.
+- Antes de entregar qualquer ajuste visual ao usuário. Confirmar que a instrução do usuário não é apenas backend.
+
+## Fontes da verdade
+1. O **código já implementado**, não um template genérico; primeiro ler `src/styles.css`, `InboxShell.tsx`, o componente alvo e a página consumidora.
+2. `.agents/rules/inboxos-uiux-consistency.md` (limites invariantes).
+3. `docs/FASE14_UIUX_AUDITORIA.md` (mapa de alterações + pendências).
+4. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md` (gates de release).
+
+## Princípios positivos obrigatórios
+1. **Não redesenhar arbitrariamente.** Continuar padrão existente Trax: fundo off-white em light, black-hole em dark, vidro sutil e cinza neutro. Cor funcional verde WhatsApp exclusivamente quando semântica pede.
+2. **Tokens e hierarquia:** usar tokens de tema e variantes existentes; definir somente novos tokens semânticos com equivalentes claro/escuro. Conservar `H1`/`H2`/corpo legíveis, controles e componentes consistentes.
+3. **Responsividade:** testar larguras 320, 360, 390, 768, 1024, 1440; mobile portrait/landscape e altura 540px. Verificar header, dock, listas, composer, ADM, auth, dialogs e overflow horizontal.
+4. **Interações:** clique/touch/teclado; botão de ícone exige `aria-label`; campos exigem nome acessível; menus exigem Escape e estado expanded; formulário exige status, erro explícito e estados loading/disabled.
+5. **Foco e toque:** área de toque aspiracional >=44px para controles primários (exceções justificadas); `:focus-visible` discernível nos dois temas; nenhum foco preso atrás de modal.
+6. **Movimento:** transições curtas 140-280ms, transform/opacity quando possível, animação de layout com moderação; respeitar `prefers-reduced-motion` sem eliminar affordances.
+7. **Alinhamento:** espaçamentos em escala 4/8/12/16/24; header e ferramentas usam eixos comuns; sidebar, tabs, cards, modais e formulários têm densidade consistente; não usar remendos globais com `!important` sem revisão explícita.
+8. **Estados:** normal/hover/focus/active/disabled/error/loading/empty/success/dark/light, network offline e textos longos devem ser revisados.
+9. **Integridade:** nunca alterar a assinatura de endpoints, objetos ou mensagens do backend para arrumar layout; manter filtros e IDs de workspace/instância.
+10. **Documentar:** causa → mudança mínima → risco → teste → evidência (arquivo, screenshot, log).
+
+## Restrições negativas
+- NÃO trocar o framework, adicionar bibliotecas de UI, substituir Phosphor por Lucide em superfícies existentes, inventar API, retirar glassmorphism ou lançar neon intenso.
+- NÃO usar fonte <12px em conteúdo funcional sem justificativa contextual; nunca depender apenas de cor para comunicar status.
+- NÃO ocultar overflow por CSS em elementos de formulário ou modal a ponto de impedir scroll; não criar duplo scroll descontrolado; não quebrar safe-area do iPhone.
+- NÃO usar `setTimeout`, reload de página ou estados locais duplicados como correção de sincronização quando o estado já existe nos hooks do produto.
+- NÃO apagar componentes, mocks, logs ou testes para fazê-los passar. Não ajustar snapshots às cegas.
+- NÃO reportar 'responsivo em todos os dispositivos' sem execução no browser.
+
+## Procedimento por tela
+1. Inventariar componentes/caminhos compartilhados e descobrir comportamento responsivo atual.
+2. Escrever checklist de estados e da intenção. Separar problema **comprovado estaticamente** de suspeita visual.
+3. Fazer patch mínimo; preferir classes locais/tokens em vez de overriding amplo.
+4. Reexecutar `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build` quando deps disponíveis. Se um comando falhar por infraestrutura, classificar BLOCKED e manter saída exata.
+5. No browser real com Deploy Preview ou `npm run dev`: capturar before/after nas seis larguras + landscape; tabulação, zoom 200%, escuro/claro, reduced motion; monitorar console, hydration warnings e network.
+6. Corrigir falhas de qualquer regressão e repetir. Entregar tabela de teste PASS/FAIL/BLOCKED com caminhos e imagens.
+
+## Critérios de aceite
+- Não quebra navegação, envio, busca, filtros, mensagens, formulário, uploads ou atalhos.
+- Sem truncamentos ilegíveis, controles inalcançáveis, vazamento horizontal, foco invisível ou botão 0x0.
+- Sem novo texto ilegível no claro/escuro, sem contrastes desproporcionais, sem sobreposição com notch e teclado.
+- Testes existentes + regressões novas verdes; browser/produção classificados pela evidência real.
diff --git a/AGENTS.md b/AGENTS.md
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -43,3 +43,8 @@
 - Atualizar **um único** registro `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md` com status, comandos e evidências, no mesmo commit das mudanças.
 - Se faltar acesso, resolver outras etapas independentes antes de pedir ao usuário o acesso exato faltante.
 - Exigir autorização explícita do usuário apenas antes de tocar produção, enviar mensagens reais ou executar ações destrutivas/irreversíveis.
+
+## Atualização Fase 14 — skills de manutenção
+- Para alterações de UI/UX, aplicar `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/rules/inboxos-uiux-consistency.md`.
+- Para backend/build/Netlify/Supabase/Evolution, aplicar `.agents/skills/inboxos-backend-release/SKILL.md` e o handoff `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`.
+- Manter edição de UI separada de migrations e mutações em produção. Exigir evidência antes de marcar gates de release como PASS.
diff --git a/PROMPT_ANTIGRAVITY_CODEX_FASE14.txt b/PROMPT_ANTIGRAVITY_CODEX_FASE14.txt
new file mode 100644
--- /dev/null
+++ b/PROMPT_ANTIGRAVITY_CODEX_FASE14.txt
@@ -0,0 +1,9 @@
+INBOXOS — RETOMADA FASE 14 (AGENTE ANTIGRAVITY + CODEX)
+
+Abra este projeto F14. Leia obrigatoriamente AGENTS.md, .agents/skills/inboxos-premium-uiux/SKILL.md, .agents/skills/inboxos-backend-release/SKILL.md, docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md, docs/FASE14_UIUX_AUDITORIA.md e docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md.
+
+POSITIVO: Preserve integralmente as correções F10-F14 e o design premium Trax. Execute G1 lockfile legítimo -> npm ci -> npm test -> audit -> lint -> TypeScript -> Vite/Netlify build. Corrija problemas reais com patch mínimo e teste. Siga G2 staging Supabase isolado, G3 API/worker multi-tenant, G4 Evolution/Resend/Groq sandbox e G5 QA browser responsivo usando a skill UI/UX. Documente causa, impacto, regressão, prova e rollback, atualizado PASS/FAIL/BLOCKED/NOT RUN. Entregue código PR/review e artefatos. Não espere a etapa seguinte se houver tarefa offline executável.
+
+NEGATIVO: NÃO reescreva a aplicação, NÃO misture versões, NÃO mude UI além de bugs comprovados, NÃO troque stack/ícones/paleta, NÃO invente npm integrity, NÃO desative testes ou segurança, NÃO use --force/--legacy-peer-deps, NÃO execute SQL destrutivo, migrations/recovery na produção, NÃO envie WhatsApp real a cliente, NÃO exponha segredos, NÃO habilite billing, NÃO publique produção sem meu ok explícito. Quando faltarem acesso ou envs, classifique BLOCKED, explique e não finja PASS.
+
+Comece por G1, retornando os resultados de cada comando e o diff de package-lock.json. Releia a skill UI antes de alterar qualquer tela. A auditoria visual permanece pendente até navegador real em build funcional.
diff --git a/docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md b/docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md
@@ -0,0 +1,238 @@
+# INBOXOS — FASE 14: HANDOFF DEFINITIVO PARA ANTIGRAVITY + CODEX
+**Documento operacional detalhado • 11/10/2026 • português brasileiro**
+
+> **Ler primeiro:** a base é o ZIP **Fase 14** que contém os patches de UI/UX já implementados neste ciclo, mais todas as fases anteriores. **Não** voltar para a Fase 10/11/12/13 nem substituir o ZIP por um repositório divergente sem diff. Esta é a divisão de trabalho: UI/UX corrigida localmente nesta rodada; **Antigravity/Codex responde por build, backend, banco, integrações, staging e QA visual real**. O objetivo é corrigir, rodar, provar — não somente gerar planos.
+
+## 0. Status incontestável e separação de responsabilidades
+
+| Área | Evidência/estado atual | Próximo responsável |
+|---|---|---|
+| Código-base F13 com correções acumuladas da Evolution | preservado na F14, sem alteração do backend nesta rodada | Codex: preservar |
+| UI/UX F14 — patches frontend | busca sincronizada, composer resiliente, inputs/ARIA, CSS responsivo e skills já no ZIP | Antigravity: QA visual, ajustes residuais somente quando comprovados |
+| 210 testes Node | **PASS 210/210** em 11/10 (202 existentes + 8 novos estáticos) | Codex: repetir no ambiente de build |
+| Auditoria de 269 arquivos TypeScript | parse e imports relativos PASS, 83 rotas PASS; NÃO é typecheck | Codex: TypeScript real |
+| `package-lock.json` | **FAIL: seis inconsistências exatas** | Codex: prioridade P0 |
+| `npm ci --offline` | **BLOCKED ENOTCACHED** para plugin Netlify | Codex: registry npm válido |
+| `npm run lint` | **BLOCKED eslint: not found** | Codex: executar após npm ci |
+| `tsc --noEmit` | **BLOCKED TS2688 vite/client missing** | Codex: executar após npm ci |
+| `npm run build` | **BLOCKED vite: not found** | Codex: executar após npm ci |
+| Staging com Supabase e Evolution reais | **NOT RUN** nesta rodada | Codex: após build |
+| Produção/WhatsApp cliente | **NENHUMA ALTERAÇÃO** | NÃO executar sem aprovação explícita |
+
+**Atenção sobre status:** FAIL = resultado comprovadamente incorreto; BLOCKED = infraestrutura/pré-requisito impeditivo, não julgamento do código; NOT RUN = ainda não executado. Não converta BLOCKED em PASS por inspecionar código.
+
+## 1. Instalação de skills e regras — OBRIGATÓRIO NO SEU WORKSPACE
+
+A F14 já contém a skill e a regra **no projeto**, nos caminhos oficialmente suportados pelo Antigravity:
+
+```text
+inboxos-evolution-final-audit/
+  AGENTS.md
+  .agents/rules/inboxos-uiux-consistency.md
+  .agents/rules/evolution-staging.md
+  .agents/rules/supabase-production-safety.md
+  .agents/skills/inboxos-premium-uiux/SKILL.md
+  .agents/skills/inboxos-backend-release/SKILL.md
+  docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md
+  docs/FASE14_UIUX_AUDITORIA.md
+```
+
+**No Antigravity:** abrir a pasta raiz que contém `package.json`. Reiniciar/recarregar a sessão do agente, solicitar que ele liste as skills disponíveis e leia **explicitamente** as duas skills F14. `AGENTS.md` e `.agents/rules/*.md` são regras persistentes. Os arquivos **não precisam ser reinstalados via `npx skills`** para este workspace. Se quiser a skill global em todos os projetos, copie conscientemente para `~/.gemini/config/skills/inboxos-premium-uiux/SKILL.md` (criar pasta) — preferir modo workspace para não contaminar outros projetos.
+
+**Não copie** a skill para `.agents/workflows/`: o local atual é `.agents/skills/`. Referência: https://antigravity.google/docs/skills e https://antigravity.google/docs/rules/ (caminhos confirmados em 11/10/2026). **A presença no ZIP não confirma que o Antigravity do usuário a carregou**: testar listagem efetiva de skills no seu aplicativo.
+
+**Para o Codex:** ele deve ler `AGENTS.md` e o handoff; se a integração Codex não carregar skills automaticamente, instruir a leitura dos dois `SKILL.md` explicitamente; não assumir que um padrão de diretórios de outro agente funciona da mesma forma.
+
+## 2. Lista EXATA das seis inconsistências do package-lock.json — P0
+
+O script `scripts/audit-release-readiness.mjs` / `scripts/lib/release-validation.mjs` acusou:
+
+1. `@lovable.dev/mcp-js` ainda como dependência no pacote raiz do lock **sem** entrada correspondente em `package.json`.
+2. `@sentry/cloudflare` ainda como dependência raiz do lock **sem** entrada correspondente em `package.json`.
+3. `@netlify/vite-plugin-tanstack-start` consta em `devDependencies` de `package.json` (`1.3.19`) **e não está corretamente listado no pacote raiz do lock**.
+4. A resolução/entrada de pacote instalado para `@netlify/vite-plugin-tanstack-start` **não existe no lock**.
+5. `@lovable.dev/vite-tanstack-config` ainda listado como devDependency no lock **sem** entrada correspondente no manifest.
+6. `nitro` ainda listado no lock como devDependency **sem** entrada correspondente no manifest.
+
+**Causa provável (hipótese, não comprovação):** manifest mudou em refatorações sucessivas e lockfile não foi refeito depois da troca de adapter/configuração. Não remover dependências transitivas por nome sem inspecionar a árvore npm resultante. Pode existir dependência transitiva ainda válida mesmo se a entrada raiz for obsoleta.
+
+**Reprodução real neste executor (evidência):**
+
+```text
+npm ci --offline --ignore-scripts --no-audit --no-fund
+=> npm ERR! ENOTCACHED request to https://registry.npmjs.org/@netlify%2fvite-plugin-tanstack-start
+npm run audit:release
+=> FAIL package-lock integrity for direct dependencies: 6 issue(s)
+npm run lint
+=> sh: eslint: not found
+npx (não executado nesta rodada; evitar download inesperado)
+tsc --noEmit
+=> error TS2688: Cannot find type definition file for 'vite/client'
+npm run build
+=> sh: vite: not found
+```
+
+**Como resolver em máquina com registry e DNS funcional:**
+
+```bash
+node -v                       # alvo: >=22.12.0, preferir 22.16.0
+npm -v                        # manifesto sugere 10.9.2
+npm config get registry       # esperado: https://registry.npmjs.org/
+npm ping                      # diagnosticar acesso, não alterar TLS para passar
+npm install --package-lock-only --ignore-scripts --no-audit --no-fund
+# revisar o diff de package-lock.json; package.json não deve mudar sem justificativa
+npm ci --include=dev --include=optional --no-audit --no-fund
+npm test
+npm run audit:release
+npm run lint
+npx --no-install tsc --noEmit
+npm run build
+npm run build:gated
+```
+
+**Aceite:** todos retornam exit 0 no mesmo commit; lock é versionado e `npm ci` reprodutível em instalação limpa; logs sem tokens e registry legítimo; diffs de TanStack/Netlify/Vite revisados. **Não usar** `--force`, `--legacy-peer-deps`, `npm install` em loop, `NODE_TLS_REJECT_UNAUTHORIZED=0`, edição manual de `integrity`, desativação do audit ou `ts-ignore` em massa.
+
+**Impacto potencial e regressão:** atualizar versões transitivas pode alterar SSR, roteamento, imports e engine Node. Comparar `vite.config.ts`, `netlify.toml`, scripts de build, `dist/client`, server handlers e generated routeTree. Se houver conflito de peerDependencies, registrar matriz de compatibilidade do conjunto React 19 / TanStack Start- Router / Vite 8 / adapter Netlify 1.3.19 e resolver a combinação menor e suportada, com testes.
+
+## 3. Dependências restantes que não podemos construir/homologar aqui — G1
+
+| ID | Falha observada | Passo Codex | Evidência mínima para PASS | Possível regressão |
+|---|---|---|---|---|
+| G1-01 | Lockfile com 6 divergências | regenerar via npm oficial; revisar diff | audit release verde | atualizar transitivas incompatíveis |
+| G1-02 | npm offline ENOTCACHED | validar TLS/DNS/registry; `npm ci` em CI limpo | log npm ci 0 sem flags de força | instalação diferente no CI |
+| G1-03 | `eslint: not found` | npm ci, depois `npm run lint` e corrigir avisos/errors reais | lint 0 | mudar hooks/comportamento involuntariamente |
+| G1-04 | `vite/client` ausente | npm ci, depois `npx --no-install tsc --noEmit` | typecheck 0 | tipos forçados/unsafe any |
+| G1-05 | `vite: not found` | npm ci, depois `npm run build` | bundle cliente+server comprovado | mismatch SSR/client, rotas |
+| G1-06 | Netlify adapter não validado | `npm run build:gated` com env teste | gate 0, log saneado | functions/route handler incompatíveis |
+| G1-07 | Server local não verificado | `npm run dev`, `npm run preview`, smoke HTTP | autenticação e páginas sem 404/hydration | reescritas de rota/API |
+| G1-08 | supply chain não inspecionada | npm audit + diff com classificação | riscos triados e mitigados | `npm audit fix` atualiza APIs sem controle |
+| G1-09 | QA frontend browser bloqueado | depois de build, navegadores nos 6 breakpoints e iOS keyboard | evidências da matriz UI F14 | ajustes de padding quebram chat em altura curta |
+
+### Se a instalação falhar novamente
+- `EAI_AGAIN/ENOTFOUND`: problema DNS/proxy. Verificar resolução, `npm config get registry`, `npm ping`, rede corporativa e certificado; parar após diagnóstico em vez de tentar opções inseguras.
+- `ENOTCACHED`: pacote exigido não está no cache offline; não continuar fingindo que o lock está correto.
+- `ERESOLVE`: peerDependency incompatível; extrair árvore `npm explain`, version matrix, ajustar a menor superfície e revalidar.
+- `ENOENT` em `vite/eslint`: node_modules inexistentes; retornar ao npm ci, não instalar pacote global como falsa correção.
+- Falha no SSR: gravar stack com rota e boundary afetados, criar regressão e não modificar todas as rotas em lote.
+
+## 4. Supabase — banco staging, migrações e segurança — G2 P0
+
+**Não podemos comprovar schema vivo a partir de arquivos SQL locais.** Mesmo os commits que criaram tabelas podem divergir do histórico real. O plano de migração detalhado já existe em `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md` e `scripts/sql/inspect-message-identity-readonly.sql`.
+
+### Passos em ordem
+- [ ] Identificar o **projeto staging** separado e o projeto real (refs distintas, sem imprimir secrets); inspecionar env efetiva do Deploy Preview; backup restaurável.
+- [ ] Conferir `supabase --help` e versão antes de usar comandos CLI; conferir changelog atual do Supabase e o histórico `supabase_migrations.schema_migrations` somente leitura.
+- [ ] Comparar migrations de setembro/outubro com schema real: colunas, constraints, triggers, índices, RLS, grants, funções e overloads de RPC.
+- [ ] Validar sem alterar produção a proteção do último owner e do último superadmin, transferência atômica, suspensões, revogação de sessão e auditoria, incluindo corridas simultâneas.
+- [ ] Testar pelo menos dois tenants e duas instâncias. Para cada endpoint privado: usuário A não lê, edita, exporta nem envia para B por UUID adulterado (IDOR/BOLA); status 403/404 ou vazio quando adequado.
+- [ ] Investigar índice/constraint antiga `messages_workspace_external_key UNIQUE (workspace_id,external_id)` e RPC `persist_inbox_message` sem escopo de instância. Alterar **somente com migration + RPC + wrappers + consumidores coordenados**, testes de concorrência e rollback. **Não dropar a UNIQUE antiga isoladamente.**
+- [ ] Rever colisões entre `client_message_id`, outbox, receipts e media. O backfill de `instance_id` é proibido se a relação é ambígua; exige plano de reconciliação.
+- [ ] Validar RLS em todas as tabelas expostas, privilégio EXECUTE de functions `SECURITY DEFINER`, políticas de Storage, `search_path`, papéis Auth e Security/Performance Advisors.
+- [ ] Testar restore, roll-forward e replay sintético em staging. Só então propor PR de migration para aprovação; sem tocar produção.
+
+### Riscos específicos que devem ser escritos no PR
+1. **Dedup entre instâncias:** IDs iguais A/B colidem na UNIQUE atual, causando perda/atualização cruzada.
+2. **Migração não atômica:** código antigo e nova UNIQUE podem divergir, com registros duplicados, mensagens perdidas ou `unread` inflado.
+3. **RLS privilegiada:** `SECURITY DEFINER` sem escopo permite dados entre tenants; não resolver com `USING (true)`.
+4. **Sessão revogada:** JWT ainda válido pode passar se o middleware não conferir revogação efetiva.
+5. **Backfill irreversível:** em presença de colididos, rollback da antiga UNIQUE pode falhar após dados válidos entrarem. Planejar roll-forward/restore verificável.
+
+**PASS G2** somente após SQL de staging aplicado, testes de concorrência e segurança aprovados, plano de recuperação e nenhum comando mutante no vivo. Relatar refs redigidas e hashes; nunca credenciais.
+
+## 5. Evolution / mensagens / filas / workers / APIs — G3 P0
+
+**Pontos conhecidos do histórico:** patches de contatos, grupos, fotos, presença, mensagens editadas/excluídas, isolamento por instância, proteção de duplicatas, retries/dead-letter, background functions, fila de webhooks. Eles passaram em testes locais, não em operação real ponta a ponta.
+
+### Arquivos/caminhos a ler antes de editar
+- `src/routes/api/public/webhooks/evolution.ts`
+- `src/routes/api/messages/send.ts`
+- `src/lib/evolution.server.ts`
+- `src/server/evolution/` (normalizadores, claims, outbox, retry e worker)
+- `netlify/functions/evolution-events.mts`, `netlify/functions/evolution-recover.mts`
+- `scripts/evolution-preview-smoke.mjs`, `scripts/validate-staging-target.mjs`
+- `tests/evolution-*`, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`.
+
+### Checklist de execução
+- [ ] Revalidar contratos HTTP mapeados (status 200/201, 400/401/403/404/409/429/5xx); não assumir que 83 rotas TS = 83 contratos HTTP.
+- [ ] Webhook inválido/repetido: não gravar nem processar duas vezes; HTTP 2xx não significa worker concluído.
+- [ ] `CONTACTS_UPDATE`, `UPSERT`, `@lid`, grupos e avatares: preservar nomes e fotos quando payload parcial, escopo workspace+instance, índices `ON CONFLICT` reais.
+- [ ] `PRESENCE`, `MESSAGES_UPSERT`, edit, delete, reaction, quoted, receipts: estado não deve retroceder, idempotência por instância, mensagens A/B isoladas.
+- [ ] Duplicata concorrente do mesmo `clientMessageId`: uma aceitação remota; timeout ambíguo: não reenviar cegamente.
+- [ ] Netlify background claims, lease expiry, poison events, dead_letter, retry, dedup e reprocessamento seletivo **somente sandbox**; registrar transições de estado.
+- [ ] APIs da autenticação e painel ADM: 2FA/OTP, rate limits, login e senha, convites/roles, superadmin e auditor, newsletter opt-in, uploads; entradas maliciosas/limites.
+- [ ] Critério PASS não é apenas testes unitários: eventos na Evolution sandbox + efeitos exatos nas tabelas + UI + logs + duas contas de teste autorizadas.
+
+### E01–E22: critérios de execução obrigatórios
+Usar a matriz **completa** já registrada em `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`. Cobertura:
+- E01–E03: autenticação de webhook, tamanho/JSON, dedup.
+- E04–E08: contatos/JIDs/chats/presença/mídia e grupo.
+- E09–E13: receipts, edição, exclusão, reação, quote, isolamento tenant/instance.
+- E14–E18: idempotência remota, timeout, outbox, recuperação, dead letter.
+- E19–E22: IA anti-replay, mensagens reais apenas entre contas de teste, webhook de preview, health/cron.
+**Não fazer** E20 até o operador confirmar números/instâncias de teste e autorização. E01–E22 não podem ser marcados como PASS porque o script sintético retornou 2xx.
+
+## 6. Integrações Resend/Groq e Administração — G4
+
+- [ ] Testar e-mails transacionais de OTP login/registro/recuperação/troca de e-mail com caixas de teste; expirado/usado/incorreto não confirma ação.
+- [ ] Testar Resend agendamentos, opt-in/unsubscribe, templates e mídias com limites e autorização; não enviar broadcast a base real.
+- [ ] Validar chave cofre criptografado/rotação, permissões de leitura superadmin/auditor/operator/support; não expor valor em JSON/log/browser.
+- [ ] Groq: desabilitar auto-reply durante smoke da Evolution; testar in/out com contas próprias, rate limit, anti-replay e escape de conteúdo adversarial.
+- [ ] Validar erros/timeouts/retries sem travar UI; observar que handoff UI F14 adicionou finally ao envio de texto.
+- [ ] Billing CORE continua **OFF**. Não reativar fork ou redesenhar preço/assinatura.
+
+## 7. Netlify Deploy Preview + QA de UI e segurança — G5
+
+- [ ] Fazer build e preview apenas após G1 verde. Deploy Preview deve referenciar staging DB e instância Evolution sandbox; conferir variáveis efetivamente resolvidas (sem imprimir segredos).
+- [ ] Rodar `npm run test:integration` apontando apenas para `TEST_BASE_URL` permitido; `PRODUCTION_APP_URL` configurado para bloquear a origem real.
+- [ ] Rodar `scripts/evolution-preview-smoke.mjs` primeiro no modo dry-run. O `--execute` exige `EVOLUTION_STAGING_SUPABASE_REF`, `EVOLUTION_PRODUCTION_SUPABASE_REF`, `STAGING_ISOLATED_DB_CONFIRMED=yes`, `STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes`, token e URL exata.
+- [ ] E01-E22 com relatório de efeitos no banco; isolar Webhook da produção.
+- [ ] Executar auditoria UI **na aplicação realmente aberta**: screenshots 320, 360, 390, 768, 1024, 1440 + landscape/iPhone + light/dark + zoom200 + reduced motion.
+- [ ] Examinar `docs/FASE14_UIUX_AUDITORIA.md`: existe risco de densidade do header de chat em 320px e possível duplicidade de Toast após falha de envio. Validar e corrigir com teste visual.
+- [ ] Verificar accessibilidade por teclado/rotulagem/contraste, modais/scroll, auth OTP, loading/error/empty, search compartilhada e safe areas.
+- [ ] Monitorar Sentry/Netlify logs ou observabilidade equivalente para 4xx/5xx, falha Background, dup sends, consultas cross-workspace.
+
+## 8. Critérios finais de release, rollback e permissão — G6
+
+**NO-GO enquanto um só P0 estiver BLOCKED/FAIL/NOT RUN.** Aprovação exige:
+
+- [ ] CI/G1 verde num commit único, sem warnings de build relevantes ou lock divergente.
+- [ ] Migrations/RLS/concurrency G2 staging e restore ensaiados.
+- [ ] G3/G4 APIs, Evolution E01–E22, Auth/Resend/Groq e outbox com evidência.
+- [ ] QA G5 com screenshots/análise de regressão light/dark/mobile.
+- [ ] Métricas/alertas, backups, planos roll-forward/rollback e feature flags prontos.
+- [ ] Aprovação explícita do proprietário **antes** de deploy no projeto de produção, alteração de banco, backlog, webhook real ou envs de produção.
+
+## 9. PROMPT POSITIVO — copiar ao Antigravity/Codex (instruções desejadas)
+
+> Trabalhe exclusivamente sobre a versão **InboxOS Fase 14** entregue, preservando suas correções de UI/UX, os hotfixes Evolution das Fases 10–13 e as decisões de produto. Abra o `AGENTS.md`, leia as skills `inboxos-premium-uiux` e `inboxos-backend-release` em `.agents/skills/`, e leia `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`, `docs/FASE14_UIUX_AUDITORIA.md` e `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`. Liste o estado real e crie branch. Execute **G1 primeiro**: npm oficial, lockfile, npm ci, tests, audit, lint, typecheck, build e Netlify gated. Para cada falha, identifique causa comprovável, menor correção segura, teste de regressão, risco e evidência; preserve o padrão de design do projeto. Depois execute G2–G5 **somente staging isolado**, validando schema Supabase real, permissões multi-tenant, idempotência de mensagens entre instâncias, evolução E01–E22 e APIs. Faça QA visual no browser usando a skill UI/UX. Atualize checklist com PASS/FAIL/BLOCKED/NOT RUN. Gere PR/patch e resumo de alterações, mas mantenha release NO-GO até tudo comprovado e **não modifique produção** sem minha autorização explícita.
+
+## 10. PROMPT NEGATIVO — copiar como proibições explícitas
+
+> NÃO reescreva o app do zero, NÃO faça redesign genérico, NÃO descarte patches das fases anteriores, NÃO troque Phosphor por outro kit, NÃO remova glassmorphism, NÃO use neon excessivo, NÃO quebre layout mobile, NÃO modifique UI se tarefa é backend, NÃO instale libs desnecessárias, NÃO remova testes, NÃO marque build como aprovado por parse estático, NÃO use `--force`/`--legacy-peer-deps`/checksums fabricados, NÃO esconda TypeScript com `any` generalizado, NÃO desligue ESLint/CI, NÃO ignore erros do Supabase, NÃO reduza controles RLS, NÃO execute `db reset`/`db push`/`migration repair`/migração/backfill na produção, NÃO envie mensagens WhatsApp a clientes, NÃO ligue agente de resposta automática em smoke, NÃO altere webhooks de produção, NÃO crie email broadcast real, NÃO exponha service_role/chaves/logs, NÃO reative Billing, NÃO publique produção ou assuma aprovação sem minha autorização. Se faltar acesso, declare BLOCKED e entregue o que conseguir comprovar offline.
+
+## 11. Entregáveis obrigatórios do Antigravity/Codex
+
+1. `docs/RELATORIO_G1_BUILD.md`: saída de cada comando, versões, diff lockfile, dependências e build artifacts (sem segredo).
+2. `docs/RELATORIO_G2_STAGING_DB.md`: constraints/RPC/RLS reais, queries read-only, migrations aplicadas só em staging, testes concorrentes e restore.
+3. `docs/RELATORIO_G3_G4_EVOLUTION_E2E.md`: E01–E22 com PASS/FAIL/BLOCKED, eventos e evidências redigidas.
+4. `docs/RELATORIO_G5_UIUX_BROWSER.md`: matriz de telas/breakpoints, prints before/after, a11y e console/hydration.
+5. `docs/RELATORIO_G6_GO_NO_GO.md`: blockers, logs, roll-forward/rollback, validação de segurança, aprovação pendente.
+6. Código corrigido + `package-lock.json` legítimo + PR/patch revisável, sem sobrescrever original.
+7. Registro por task: `ID | causa | arquivos | alteração | risco | teste | resultado | prova | rollback`.
+
+## 12. Checkpoint de execução que você deve atualizar
+
+| Gate | Status em 11/10/2026 | Critério de saída |
+|---|---|---|
+| G0 Base | PASS parcial (base F14) | hash/branch/env confirmados no Antigravity |
+| G1 npm/build | FAIL/BLOCKED | npm ci + lint + tsc + build/gated PASS |
+| G2 Supabase | BLOCKED | staging + migration + RLS + multi-instância PASS |
+| G3 APIs/filas | BLOCKED | HTTP autenticado/outbox/worker PASS |
+| G4 Evolution/IA/Email | NOT RUN | E01–E22 e fluxos permitidos PASS |
+| G5 Preview/QA | BLOCKED | screenshots + console + smoke + a11y PASS |
+| G6 Lançamento | NO-GO | P0 completos + aprovação humana |
+
+### Referências preservadas do projeto
+`ANTIGRAVITY_NPM_E_CONTEXTO_COMPLETO.md`, `docs/FASE13_PLANO_E_CHECKLIST.md`, `docs/FASE12_PLANO_E_CHECKLIST_ATUALIZADO.md`, `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md`, `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`, `docs/FASE12_MULTINSTANCIA_PLANO_DE_MIGRACAO.md`, `docs/FASE14_UIUX_AUDITORIA.md`.
+
+**Não assumir** que relatórios históricos equivalem a execução atual; a fonte de verdade de cada gate é a evidência da revisão atual em staging/CI.
diff --git a/docs/FASE14_UIUX_AUDITORIA.md b/docs/FASE14_UIUX_AUDITORIA.md
new file mode 100644
--- /dev/null
+++ b/docs/FASE14_UIUX_AUDITORIA.md
@@ -0,0 +1,49 @@
+# InboxOS — Fase 14 | Auditoria UI/UX (código alterado)
+
+**Base:** ZIP Fase 13 de 11/10/2026. **Responsável neste ciclo:** frontend/UX apenas. **Backend:** destinado a Antigravity/Codex conforme handoff F14. **Release:** NO-GO.
+
+## Problemas confirmados estaticamente e corrigidos
+
+| Ref | Causa na Fase 13 | Mudança na Fase 14 | O que pode quebrar | Validação realizada | Limite |
+|---|---|---|---|---|---|
+| UI-01 | Busca global tinha `globalSearch` local, mas lista usava `filters.searchQuery`; editar em um lugar não atualizava o outro | Cabeçalho agora usa diretamente `filters.searchQuery` | Pesquisa persistente pode aparecer no cabeçalho, intencional | Teste de contrato F14/UI01 PASS | Fluxo navegador pendente |
+| UI-02 | Se `onSendMessage` lançasse exceção, `isSending` ficava `true` para sempre | Envio envolto por try/catch/finally, com notificação e liberação do loading | Toast duplicado se hook também notificar erro; revisar no E2E | F14/UI02 PASS | Erro real de rede pendente |
+| UI-03 | Enter confirmava envio enquanto usuário compunha caractere via IME | Ignorar Enter quando `nativeEvent.isComposing` | Método de envio por Enter continua; Shift+Enter mantém quebra | F14/UI03 PASS | IME real no browser pendente |
+| UI-04 | Menu de anexos sem fechar via Escape e botões sem estado acessível | Escape, aria-expanded, aria-label e identificação do grupo de anexos | Escape só age com menu aberto | F14/UI04 PASS | Foco keyboard real pendente |
+| UI-05 | Busca e filtros não anunciavam nome/estado suficiente a tecnologias assistivas | Labels e aria-pressed dos filtros; limpar busca acessível | Sem alteração no algoritmo dos filtros | F14/UI05 PASS | Leitor de tela pendente |
+| UI-06 | Ícones de ChatHeader dependiam de title/visual, e não expunham estado | aria-label, aria-pressed/expanded, classe para alvo tátil | Cabeçalho pode ficar mais denso em 320px; validar | F14/UI06 PASS | Capturas mobile pendentes |
+| UI-07 | Dock/ícones mobile tinham alvos de 36px e texto efetivo abaixo de 10px; formulários e status abaixo de 12px | Overrides escopados para touch, leitura, focus, safe-area e reduced motion | Mais altura e necessidade de rolagem em telas curtas; inspecionar iOS landscape | F14/UI07 PASS | QA visual pendente |
+| UI-08 | Padrão visual existia apenas parcialmente em CSS, sem instrução reutilizável do agente | Skill workspace, rule always_on e AGENTS.md vinculados | Se agente ignorar arquivos ou tiver regra global conflitante, verificar em seu ambiente | F14/UI08 PASS | Ativação Antigravity externo pendente |
+| UI-09 | Feedback no login OTP/erro não possuía papéis de anúncio | `role=status`, `role=alert`, label e pattern do OTP | Se a validação nativa impedir submissão inválida, comportamento desejado | Parse/auditoria PASS | Screenreader/teste real pendente |
+
+## Arquivos alterados na F14 (UI e governança)
+- `src/features/inbox/components/InboxShell.tsx`
+- `src/features/inbox/components/MessageComposer.tsx`
+- `src/features/inbox/components/ConversationList.tsx`
+- `src/features/inbox/components/ChatHeader.tsx`
+- `src/routes/auth/login.tsx`
+- `src/styles.css`
+- `package.json` (script de testes inclui F14)
+- `tests/uiux-phase14.test.ts`
+- `.agents/rules/inboxos-uiux-consistency.md`, `.agents/skills/inboxos-premium-uiux/SKILL.md`, `.agents/skills/inboxos-backend-release/SKILL.md`, `AGENTS.md`.
+
+## Trabalho UI que continua obrigatório (não declarar concluído)
+- [ ] QA visual com código compilado e screenshots em **320, 360, 390, 768, 1024, 1440**; testar portrait e landscape do iPhone, tablet e zoom 200%.
+- [ ] Validar sidebar recolhida/aberta, inbox sem conversa, carregando, erro, pesquisa, filtros, nome de grupo longo e sem avatar.
+- [ ] Validar menu de anexos, fechamento por Escape, navegação Tab/Shift+Tab e foco restaurado após fechar dialogs.
+- [ ] Revisar layout de ChatHeader no 320px e 360px com nomes longos (possível sobreposição dos botões).
+- [ ] Validar os três níveis de glassmorphism e contraste em light/dark sob transparência reduzida.
+- [ ] Inspecionar `SettingsView`, `SystemAdminView`, `ProductViews`, `ImportExportModal`, `ConnectionManager`, `QrCodeDialog` via browser: não houve auditoria visual real nestas superfícies.
+- [ ] Testar autenticação com teclado aberto, OTP inválido, spinner e mensagens de erro por screen reader.
+- [ ] Monitorar console por hydration mismatch e warnings de acessibilidade; monitorar network para garantir que filtros não gerem requests redundantes.
+- [ ] Conferir resposta de erro de rede do envio (toast apenas uma vez; texto preservado; botão liberado) e enviar via IME real.
+- [ ] Executar auditoria automatizada de contraste e WCAG 2.2 AA no browser; corrigir achados individuais, não aplicar resets globais de CSS.
+
+## Evidências atuais e limites
+- `npm test`: **210/210 PASS**, sendo **8 testes F14 adicionais** de contrato estático; isso NÃO equivale a E2E visual.
+- `npm run audit:release`: **269 arquivos TS/TSX/MTS parseados**, zero erros de parsing/import local, 83 rotas mapeadas; **FAIL** 6 itens do lockfile.
+- `npm ci --offline`: **ENOTCACHED** no plugin Netlify.
+- `npm run lint`: **BLOCKED** (`eslint: not found`).
+- `tsc --noEmit`: **BLOCKED** (`Cannot find type definition file for 'vite/client'`).
+- `npm run build`: **BLOCKED** (`vite: not found`).
+- Nenhum screenshot da aplicação em execução, nenhum Deploy Preview, nenhuma modificação backend/Supabase/produção neste ciclo.
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
     "preview": "vite preview",
     "lint": "eslint .",
     "format": "prettier --write .",
-    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts",
+    "test": "node --experimental-strip-types --test tests/unit.test.ts tests/recovery.test.ts tests/system-admin.test.ts tests/admin-hardening.test.ts tests/media-signatures.test.ts tests/newsletter-upload-policy.test.ts tests/release-validation.test.ts tests/reconciled-migration.test.ts tests/password-recovery-security.test.ts tests/account-change-otp.test.ts tests/deployment-gate.test.ts tests/sensitive-account-rates.test.ts tests/staging-target-policy.test.ts tests/runtime-auth-hardening.test.ts tests/evolution-webhook-hardening.test.ts tests/evolution-recovery.test.ts tests/trusted-origin.test.ts tests/credentialed-fetch.test.ts tests/evolution-ingress-boundary.test.ts tests/evolution-receipts.test.ts tests/health-diagnostics.test.ts tests/evolution-live-regressions.test.ts tests/evolution-multitenant-group.test.ts tests/evolution-instance-mutation-scope.test.ts tests/message-identity-diagnostic.test.ts tests/evolution-preview-safety.test.ts tests/uiux-phase14.test.ts",
     "test:integration": "node --experimental-strip-types --test tests/integration.test.ts",
     "audit:release": "node scripts/audit-release-readiness.mjs",
     "audit:env": "node scripts/audit-production-env.mjs",
diff --git a/src/features/inbox/components/ChatHeader.tsx b/src/features/inbox/components/ChatHeader.tsx
--- a/src/features/inbox/components/ChatHeader.tsx
+++ b/src/features/inbox/components/ChatHeader.tsx
@@ -87,6 +87,7 @@
               onClick={onBack}
               className={`${layout === "mobile" ? "flex" : "hidden"} rounded-lg p-2 text-slate-500 hover:bg-slate-100`}
               title="Voltar para conversas"
+              aria-label="Voltar para conversas"
             >
               <ArrowLeft size={18} weight="bold" />
             </button>
@@ -181,12 +182,13 @@
           <button
             type="button"
             onClick={() => setIsProfileOpen(true)}
-            className={`p-2 rounded-lg transition-colors ${
+            className={`chat-header-action p-2 rounded-lg transition-colors ${
               isDarkMode
                 ? "text-neutral-500 hover:text-white hover:bg-white/[0.05]"
                 : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
             }`}
             title="Ver perfil comercial e dados do contato"
+              aria-label="Ver perfil comercial e dados do contato"
           >
             <Info size={17} weight="bold" />
           </button>
@@ -194,7 +196,7 @@
           <button
             type="button"
             onClick={onTogglePin}
-            className={`p-2 rounded-lg transition-colors ${
+            className={`chat-header-action p-2 rounded-lg transition-colors ${
               conversation.pinned
                 ? "text-amber-400 bg-amber-400/10"
                 : isDarkMode
@@ -202,6 +204,8 @@
                   : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
             }`}
             title={conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}
+            aria-label={conversation.pinned ? "Desafixar conversa" : "Fixar conversa"}
+            aria-pressed={conversation.pinned}
           >
             <PushPin size={17} weight={conversation.pinned ? "fill" : "regular"} />
           </button>
@@ -210,7 +214,7 @@
           <button
             type="button"
             onClick={onToggleArchive}
-            className={`p-2 rounded-lg transition-colors ${
+            className={`chat-header-action p-2 rounded-lg transition-colors ${
               conversation.archived
                 ? isDarkMode
                   ? "text-zinc-200 bg-white/[0.06]"
@@ -220,6 +224,8 @@
                   : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
             }`}
             title={conversation.archived ? "Desarquivar conversa" : "Arquivar conversa"}
+            aria-label={conversation.archived ? "Desarquivar conversa" : "Arquivar conversa"}
+            aria-pressed={conversation.archived}
           >
             <Archive size={17} weight={conversation.archived ? "fill" : "regular"} />
           </button>
@@ -229,12 +235,14 @@
             <button
               type="button"
               onClick={() => setIsMenuOpen(!isMenuOpen)}
-              className={`p-2 rounded-lg transition-colors ${
+              className={`chat-header-action p-2 rounded-lg transition-colors ${
                 isDarkMode
                   ? "text-neutral-400 hover:text-white hover:bg-[#1a1a22]"
                   : "text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100"
               }`}
               title="Mais opções"
+              aria-label="Mais opções"
+              aria-expanded={isMenuOpen}
             >
               <DotsThreeVertical size={18} weight="bold" />
             </button>
diff --git a/src/features/inbox/components/ConversationList.tsx b/src/features/inbox/components/ConversationList.tsx
--- a/src/features/inbox/components/ConversationList.tsx
+++ b/src/features/inbox/components/ConversationList.tsx
@@ -90,6 +90,7 @@
             <input
               type="text"
               placeholder="Buscar conversa..."
+              aria-label="Buscar conversa por nome ou número"
               value={filters.searchQuery}
               onChange={(e) => onUpdateFilters({ searchQuery: e.target.value })}
               className="w-full bg-transparent text-xs placeholder-neutral-400 focus:outline-none"
@@ -98,6 +99,7 @@
               <button
                 type="button"
                 onClick={() => onUpdateFilters({ searchQuery: "" })}
+                aria-label="Limpar busca de conversas"
                 className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
               >
                 <X size={13} />
@@ -116,6 +118,7 @@
                   : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-950"
               }`}
               title="Sincronizar fotos de perfil do WhatsApp"
+              aria-label="Sincronizar fotos de perfil do WhatsApp"
             >
               <ArrowsClockwise
                 size={15}
@@ -134,6 +137,7 @@
                   : "bg-neutral-50 border-neutral-200 text-neutral-600 hover:text-neutral-950"
               }`}
               title="Importar contatos ou exportar histórico"
+              aria-label="Importar contatos ou exportar histórico"
             >
               <UploadSimple size={15} />
             </button>
@@ -163,6 +167,7 @@
                   ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                   : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
             }`}
+            aria-pressed={(filters.typeFilter === "all" || !filters.typeFilter) && !filters.onlyUnread && !filters.showArchived}
           >
             Todas
           </button>
@@ -181,6 +186,7 @@
                   ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                   : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
             }`}
+            aria-pressed={filters.onlyUnread}
           >
             Não Lidas
           </button>
@@ -203,6 +209,7 @@
                   ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                   : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
             }`}
+            aria-pressed={filters.typeFilter === "groups"}
           >
             Grupos
           </button>
@@ -221,6 +228,7 @@
                   ? "bg-[#16161e] text-neutral-400 hover:text-white border border-[#242430]"
                   : "bg-neutral-100 text-neutral-600 hover:text-neutral-950 border border-neutral-200/60"
             }`}
+            aria-pressed={filters.showArchived}
           >
             Arquivadas
           </button>
diff --git a/src/features/inbox/components/InboxShell.tsx b/src/features/inbox/components/InboxShell.tsx
--- a/src/features/inbox/components/InboxShell.tsx
+++ b/src/features/inbox/components/InboxShell.tsx
@@ -55,7 +55,6 @@
   const [isQrModalOpen, setIsQrModalOpen] = useState(false);
   const [isImportExportOpen, setIsImportExportOpen] = useState(false);
   const [qrInstanceName, setQrInstanceName] = useState<string | null>(null);
-  const [globalSearch, setGlobalSearch] = useState("");
   const [previewMedia, setPreviewMedia] = useState<{
     type: "image" | "video" | "document";
     url: string;
@@ -206,7 +205,9 @@
                   ? "text-neutral-500 hover:text-white hover:bg-white/[0.055]"
                   : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
               }`}
-              title={isRailOpen ? "Ocultar Navegação" : "Mostrar Navegação"}
+              title={isRailOpen ? "Ocultar navegação" : "Mostrar navegação"}
+              aria-label={isRailOpen ? "Ocultar navegação" : "Mostrar navegação"}
+              aria-expanded={isRailOpen}
             >
               <SidebarSimple size={18} weight="bold" />
             </button>
@@ -247,11 +248,9 @@
                 <input
                   type="text"
                   placeholder="Buscar conversas"
-                  value={globalSearch}
-                  onChange={(e) => {
-                    setGlobalSearch(e.target.value);
-                    updateFilters({ searchQuery: e.target.value });
-                  }}
+                  value={filters.searchQuery}
+                  onChange={(e) => updateFilters({ searchQuery: e.target.value })}
+                  aria-label="Buscar conversas"
                   className="w-44 bg-transparent text-xs placeholder-neutral-500 focus:outline-none"
                 />
               </div>
@@ -266,7 +265,8 @@
                   ? "text-neutral-500 hover:text-white hover:bg-white/[0.055]"
                   : "text-neutral-500 hover:text-neutral-950 hover:bg-black/[0.04]"
               }`}
-              title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
+              title={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
+              aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
             >
               {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
             </button>
@@ -292,9 +292,9 @@
               <h1 className="mobile-title">{currentViewMeta.title}</h1>
             </div>
             <div className="flex items-center gap-1.5">
-              {currentView === "inbox" && <button type="button" className="mobile-account-pill" onClick={() => setCurrentView("conexoes")}><span className="status-dot" />{instances.filter((i) => i.state === "open").length}<CaretDown size={12}/></button>}
-              <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className="mobile-icon-button" aria-label="Alternar tema">{isDarkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
-              <button type="button" onClick={() => setCurrentView("configuracoes")} className="mobile-profile-button" aria-label="Abrir perfil">TX</button>
+              {currentView === "inbox" && <button type="button" className="mobile-account-pill" onClick={() => setCurrentView("conexoes")} aria-label="Gerenciar conexões WhatsApp"><span className="status-dot" />{instances.filter((i) => i.state === "open").length}<CaretDown size={12}/></button>}
+              <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className="mobile-icon-button" aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}>{isDarkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
+              <button type="button" onClick={() => setCurrentView("configuracoes")} className="mobile-profile-button" aria-label="Abrir configurações">TX</button>
             </div>
           </header>
         )}
diff --git a/src/features/inbox/components/MessageComposer.tsx b/src/features/inbox/components/MessageComposer.tsx
--- a/src/features/inbox/components/MessageComposer.tsx
+++ b/src/features/inbox/components/MessageComposer.tsx
@@ -82,6 +82,16 @@
     }
   }, [replyingTo]);
 
+  // O menu também fecha via Escape, sem afetar o editor ou as mensagens.
+  useEffect(() => {
+    if (!isAttachOpen) return;
+    const onEscape = (event: KeyboardEvent) => {
+      if (event.key === "Escape") setIsAttachOpen(false);
+    };
+    document.addEventListener("keydown", onEscape);
+    return () => document.removeEventListener("keydown", onEscape);
+  }, [isAttachOpen]);
+
   // Fecha menu de anexos se clicar fora
   useEffect(() => {
     const handleClickOutside = (e: MouseEvent) => {
@@ -119,15 +129,19 @@
         }
       : {};
 
-    const ok = await onSendMessage({ text: clean, type: "text", ...quotedPayload });
-    if (ok) {
-      setText("");
-      if (inputRef.current) {
-        inputRef.current.style.height = "auto";
+    try {
+      const ok = await onSendMessage({ text: clean, type: "text", ...quotedPayload });
+      if (ok) {
+        setText("");
+        if (inputRef.current) inputRef.current.style.height = "auto";
+        if (onCancelReply) onCancelReply();
       }
-      if (onCancelReply) onCancelReply();
-    }
-    setIsSending(false);
+    } catch {
+      WhatsAppToast.networkError("Não foi possível enviar a mensagem. Tente novamente.");
+    } finally {
+      // Mesmo em falha de rede o usuário pode corrigir o texto e tentar de novo.
+      setIsSending(false);
+    }
   };
 
   const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
@@ -142,7 +156,7 @@
   };
 
   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
-    if (e.key === "Enter" && !e.shiftKey) {
+    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
       e.preventDefault();
       handleSendText();
     }
@@ -226,7 +240,7 @@
   };
 
   return (
-    <div className="flex flex-col shrink-0">
+    <div className="message-composer flex flex-col shrink-0">
       {/* Barra Flutuante de Resposta / Citação (Quote Bar) */}
       {replyingTo &&
         (() => {
@@ -264,6 +278,7 @@
                 onClick={onCancelReply}
                 className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors ml-2 shrink-0 hover:bg-white/10"
                 title="Cancelar resposta"
+                aria-label="Cancelar resposta"
               >
                 <X size={15} weight="bold" />
               </button>
@@ -296,6 +311,9 @@
           {isAttachOpen && (
             <div
               ref={attachMenuRef}
+              id="message-attachments-menu"
+              role="group"
+              aria-label="Opções de anexos"
               className={`absolute bottom-full mb-3 left-4 p-2 rounded-xl border shadow-2xl z-20 flex flex-col gap-1 w-52 animate-smooth-in ${
                 isDarkMode
                   ? "bg-[#181822] border-[#2a2a36] text-white shadow-black/80"
@@ -376,6 +394,9 @@
                       : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                 }`}
                 title="Anexar foto, vídeo ou documento"
+                aria-label="Anexar foto, vídeo ou documento"
+                aria-expanded={isAttachOpen}
+                aria-controls="message-attachments-menu"
               >
                 <Paperclip size={19} weight="bold" />
               </button>
@@ -384,6 +405,7 @@
               <textarea
                 ref={inputRef}
                 rows={1}
+                aria-label="Escrever mensagem"
                 placeholder={
                   replyingTo
                     ? `Respondendo a ${sanitizeSenderName(replyingTo.senderName, replyingTo.senderPhone)}...`
@@ -407,6 +429,7 @@
                   disabled={isSending}
                   className="rounded-lg bg-white p-2.5 text-black transition-colors hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-black"
                   title="Enviar mensagem"
+                  aria-label="Enviar mensagem"
                 >
                   <PaperPlaneRight size={19} weight="fill" />
                 </button>
@@ -420,6 +443,7 @@
                       : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                   }`}
                   title="Gravar mensagem de voz"
+                  aria-label="Gravar mensagem de voz"
                 >
                   <Microphone size={19} weight="bold" />
                 </button>
diff --git a/src/routes/auth/login.tsx b/src/routes/auth/login.tsx
--- a/src/routes/auth/login.tsx
+++ b/src/routes/auth/login.tsx
@@ -145,14 +145,16 @@
             <input
               className="auth-otp"
               inputMode="numeric"
+              pattern="[0-9]{6}"
+              aria-label="Código de segurança de seis dígitos"
               autoComplete="one-time-code"
               maxLength={6}
               value={code}
               onChange={(e) => setCode(normalizeOtp(e.target.value))}
             />
           </label>
-          {status && <p className="auth-hint">{status}</p>}
-          {error && <p className="auth-inline-status is-invalid">{error}</p>}
+          {status && <p className="auth-hint" role="status">{status}</p>}
+          {error && <p className="auth-inline-status is-invalid" role="alert">{error}</p>}
           <button className="auth-primary" disabled={busy || code.length !== 6}>
             {busy ? "Confirmando…" : "Confirmar dispositivo"}
           </button>
@@ -209,7 +211,7 @@
               Esqueci minha senha
             </Link>
           </div>
-          {error && <p className="auth-inline-status is-invalid">{error}</p>}
+          {error && <p className="auth-inline-status is-invalid" role="alert">{error}</p>}
           <button className="auth-primary" disabled={busy}>
             {busy ? "Entrando…" : "Entrar"}
           </button>
diff --git a/src/styles.css b/src/styles.css
--- a/src/styles.css
+++ b/src/styles.css
@@ -630,3 +630,77 @@
 .legal-page{min-height:100dvh;background:#080809;color:#f4f4f5;padding:max(18px,env(safe-area-inset-top)) clamp(12px,3vw,32px) max(24px,env(safe-area-inset-bottom));overflow:auto}.legal-card{width:min(100%,860px);margin:0 auto;border:1px solid rgba(255,255,255,.08);border-radius:24px;background:#101012;padding:clamp(20px,4vw,48px)}.legal-meta{display:flex;justify-content:space-between;gap:12px;margin-bottom:28px;color:#71717a;font-size:10px}.legal-back{color:#d4d4d8}.legal-copy h1{font-size:clamp(25px,5vw,38px)}.legal-copy h2{margin:28px 0 8px;font-size:15px}.legal-copy p{color:#a1a1aa;font-size:12px;line-height:1.8}.legal-footer-note{margin-top:32px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07);color:#71717a;font-size:10px}
 .legal-consent-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px)}.legal-consent-panel{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:min(100%,720px);max-height:88dvh;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#111113;color:#f4f4f5}.legal-consent-header,.legal-consent-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px}.legal-consent-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 18px 36px}.legal-consent-document+.legal-consent-document{margin-top:36px;padding-top:28px;border-top:1px solid rgba(255,255,255,.07)}.legal-consent-document p{color:#a1a1aa;font-size:11px;line-height:1.7}.legal-consent-version{color:#71717a;font-size:9px}.legal-consent-footer button{height:38px;border:0;border-radius:11px;padding:0 14px;background:#f4f4f5;color:#09090b;font-size:10px;font-weight:800}.legal-consent-footer button:disabled{opacity:.38}
 @media(max-width:767px){.legal-consent-backdrop{place-items:end center;padding:0}.legal-consent-panel{width:100%;max-height:94dvh;border-radius:22px 22px 0 0}.auth-legal-row{align-items:flex-start;flex-direction:column}.auth-legal-row button{width:100%}}
+
+
+/* Fase 14 — Design consistency / accessibility overrides.
+   Scope overrides to InboxOS surfaces; do not alter API/business logic.
+   Review visually at 320, 360, 390, 768, 1024, 1440 px and iOS landscape. */
+:root {
+  --inboxos-focus-ring: #9ca3af;
+  --inboxos-touch-target: 44px;
+}
+.inbox-app,
+.auth-page,
+.legal-page { text-rendering: optimizeLegibility; }
+
+/* Avoid flex children forcing the conversation pane off narrow screens. */
+.inbox-app > .flex-1,
+.inbox-app .conversation-panel,
+.inbox-app .message-composer,
+.inbox-app .chat-header-action { min-width: 0; }
+.inbox-app > .flex-1 { min-height: 0; }
+
+/* Keyboard accessibility: visible in both themes, without mouse-only rings. */
+:is(.inbox-app, .auth-page, .legal-page, .legal-consent-panel) :is(button, a, input, textarea, select, [role="button"]):focus-visible {
+  outline: 2px solid var(--inboxos-focus-ring);
+  outline-offset: 3px;
+}
+.inbox-app :is(button, [role="button"]):disabled { cursor: not-allowed; }
+.inbox-app .app-topbar button { min-width: var(--inboxos-touch-target); min-height: var(--inboxos-touch-target); }
+.inbox-app .chat-header-action { min-width: 40px; min-height: 40px; display: inline-flex; align-items:center; justify-content:center; }
+
+/* Usable mobile controls and notch/keyboard insets. */
+.inbox-app .mobile-icon-button,
+.inbox-app .mobile-profile-button { width: var(--inboxos-touch-target); min-height: var(--inboxos-touch-target); }
+.inbox-app .mobile-account-pill { min-height: var(--inboxos-touch-target); padding-inline: .75rem; }
+.inbox-app .mobile-dock-item { min-height: 54px; font-size: .7rem; opacity: .78; }
+.inbox-app .mobile-dock-item.is-active { opacity: 1; }
+.inbox-app .mobile-dock-badge { right: -0.5rem; top: -0.3rem; }
+.inbox-app .mobile-eyebrow { font-size: .66rem; }
+.inbox-app .mobile-profile-button { font-size: .75rem; }
+.inbox-app .mobile-account-pill { font-size: .75rem; }
+.inbox-app .mobile-dock { padding-bottom: max(.45rem, env(safe-area-inset-bottom, 0px)); }
+@media (max-width: 767px) {
+  .inbox-app .message-composer { padding-bottom: env(safe-area-inset-bottom, 0px); }
+  .inbox-app .conversation-panel { min-height: 0; }
+}
+@media (max-height: 540px) {
+  .inbox-app.vp-y-short .mobile-dock-item { min-height: 44px; }
+}
+
+/* Authentication fields: small helper text is hard to read on mobile. */
+.auth-page .auth-heading p { font-size: .875rem; }
+.auth-page .auth-field > span,
+.auth-page .auth-country-field > span,
+.auth-page .auth-check,
+.auth-page .auth-link,
+.auth-page .auth-footer { font-size: .8rem; }
+.auth-page .auth-hint,
+.auth-page .auth-inline-status,
+.auth-page .password-rules,
+.auth-page .auth-legal-row span { font-size: .75rem; line-height: 1.5; }
+.auth-page .auth-field input,
+.auth-page .auth-country-field select,
+.auth-page .auth-primary,
+.auth-page .auth-secondary,
+.auth-page .auth-phone > button { min-height: 44px; }
+.auth-page .auth-otp { letter-spacing: .28em; }
+.auth-page .auth-inline-status.is-invalid { color: #fca5a5; }
+.auth-page .auth-primary:disabled { opacity: .55; }
+
+/* Preserve hover affordances without imposing animations on reduced-motion users. */
+@media (prefers-reduced-motion: reduce) {
+  .inbox-app .mobile-dock-item,
+  .auth-page .auth-primary,
+  .auth-page .auth-secondary { transform: none !important; transition: none !important; }
+}
diff --git a/tests/uiux-phase14.test.ts b/tests/uiux-phase14.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/uiux-phase14.test.ts
@@ -0,0 +1,61 @@
+import test from "node:test";
+import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
+import { resolve } from "node:path";
+
+const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
+
+test("F14/UI01: desktop and sidebar search share the same filter state", () => {
+  const code = source("src/features/inbox/components/InboxShell.tsx");
+  assert.match(code, /value=\{filters\.searchQuery\}/);
+  assert.doesNotMatch(code, /globalSearch|setGlobalSearch/);
+});
+
+test("F14/UI02: composer releases busy state after failed Promise", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /try\s*\{\s*const ok = await onSendMessage\(/);
+  assert.match(code, /finally\s*\{[^}]*setIsSending\(false\)/);
+});
+
+test("F14/UI03: pressing Enter during IME composition does not send", () => {
+  assert.match(source("src/features/inbox/components/MessageComposer.tsx"), /!e\.nativeEvent\.isComposing/);
+});
+
+test("F14/UI04: attachment menu accessible and dismissible with Escape", () => {
+  const code = source("src/features/inbox/components/MessageComposer.tsx");
+  assert.match(code, /event\.key === "Escape"/);
+  assert.match(code, /aria-expanded=\{isAttachOpen\}/);
+  assert.match(code, /aria-label="Escrever mensagem"/);
+});
+
+test("F14/UI05: conversation search/facet state exposed to assistive technologies", () => {
+  const code = source("src/features/inbox/components/ConversationList.tsx");
+  assert.match(code, /aria-label="Limpar busca de conversas"/);
+  for (const facet of ["filters.onlyUnread", "filters.showArchived", 'filters.typeFilter === "groups"']) {
+    assert.ok(code.includes(`aria-pressed={${facet}}`));
+  }
+});
+
+test("F14/UI06: icon controls have accessible names and state", () => {
+  const code = source("src/features/inbox/components/ChatHeader.tsx");
+  assert.match(code, /aria-label="Mais opções"/);
+  assert.match(code, /aria-expanded=\{isMenuOpen\}/);
+  assert.match(code, /aria-pressed=\{conversation.pinned\}/);
+  assert.match(code, /aria-pressed=\{conversation.archived\}/);
+});
+
+test("F14/UI07: CSS includes keyboard focus, safe areas and reduced motion", () => {
+  const css = source("src/styles.css");
+  assert.match(css, /--inboxos-touch-target:\s*44px/);
+  assert.match(css, /:focus-visible/);
+  assert.match(css, /safe-area-inset-bottom/);
+  assert.match(css, /prefers-reduced-motion:\s*reduce/);
+});
+
+test("F14/UI08: reusable design skill and always-on agent rule ship in project", () => {
+  const skill = source(".agents/skills/inboxos-premium-uiux/SKILL.md");
+  const rule = source(".agents/rules/inboxos-uiux-consistency.md");
+  assert.match(skill, /^---\nname:\s*inboxos-premium-uiux/m);
+  assert.match(rule, /^---\ntrigger:\s*always_on/m);
+  assert.match(skill, /320, 360, 390, 768, 1024, 1440/);
+});

```

## 14. Últimas regras: NO-GO / governança

Não executar deploy de produção, alterar migrations/bucket/RLS live, mudar Evolution webhook, enviar mensagens aos clientes, reprocessar filas, rodar `db reset`, `db push` ou `migration repair` em ambiente vivo. Não fazer truques para passar testes. Se não for possível provar, status BLOCKED/NOT RUN com evidência da limitação. O objetivo é finalizar o InboxOS existente, testado e seguro, sem reiniciar implementação e sem mascarar bugs.
