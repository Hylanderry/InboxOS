# InboxOS — Plano de implementação do Unslop (UI, movimento, carregamento, layout)

> **Para quem for executar:** use `superpowers:executing-plans` ou `superpowers:subagent-driven-development`,
> uma tarefa por vez, marcando os passos. Antes de tocar em UI: skills `inboxos-premium-uiux`,
> `frontend-design` e `vercel-react-best-practices`.

**Objetivo:** tirar a cara de IA do sistema, com alinhamento e espaçamento consistentes, rolagem própria por
tela, entradas e saídas suaves, respostas rápidas e sem telas de carregamento repetidas.

**Abordagem:** primeiro corrigir bugs de cascata; depois criar uma única fonte de tokens e uma camada de
primitivos (PageShell, Segmented, Modal, motion.css); só então migrar tela por tela. Nada de redesenho livre:
continua a identidade Trax (neutros, vidro discreto, Phosphor, PT-BR).

**Base:** `docs/INVENTARIO_PAGINAS_FUNCOES.md` e o checklist do Anexo A (neste arquivo).
As medições são de leitura estática do código; **nada foi medido no navegador** (por isso a F0 existe).

## Restrições globais
- Sem biblioteca de UI nova, sem segunda família de ícones, sem cores saturadas novas.
- Não alterar APIs, auth, RLS, banco ou billing por motivo visual. O que exigir backend está marcado **[BACKEND]**.
- Nunca declarar tela pronta sem screenshot real em 320, 360, 390, 768, 1024 e 1440, claro e escuro. Sem acesso: `BLOCKED`.
- O `.env` local usa o banco real: validar sem criar, editar, enviar ou excluir (ou com staging).
- Cada tarefa: teste primeiro, mudança mínima, `tsc`, `npm test`, lint, integração local, audits e build; um commit.
- Teste novo entra na linha `"test"` do `package.json`. Não apagar teste para passar: quando o contrato mudar, reescrever preservando a intenção.

## Sistema único de medidas
| Grupo | Valores |
|---|---|
| Espaço | `--sp-1:4` `--sp-2:8` `--sp-3:12` `--sp-4:16` `--sp-6:24` `--sp-8:32` (px) |
| Página | `--page-gutter`: 12 (<640), 16 (≥640), 24 (≥1024), igual na topbar e no conteúdo; `--page-end:24`; `--page-max:1320` |
| Cabeçalhos | `--header-h:56` em topbar, lista, chat, rail e contas |
| Painéis/drawers/modais | `--panel-x`: 16 (20 ≥640); topo 12, corpo 16 |
| Controles | 32 / 36 (padrão: botão, input, select, segmented) / 40; toque: 44 |
| Raios | 6 (badge) · 8 (controle, linha) · 12 (painel, modal) · 999 |
| Tipo (px/linha) | 11/16 · 12/18 · 13/20 · 15/22 · 20/28; input no toque 16; pesos 400/500/600 |
| Ritmo | 8 entre controles · 16 entre painéis · 24 entre blocos; no máximo um nível de caixa |

## Sistema único de movimento
| Uso | Duração | Curva |
|---|---|---|
| Hover/pressionar (só `.ux-btn`) | 90 ms | ease-out |
| Saídas; troca de conteúdo de aba | 130 ms | `cubic-bezier(0.4,0,1,1)` |
| Popover/modal entrando; indicador de abas; troca de tela | 180 ms (tela: fade 160) | `cubic-bezier(0.22,1,0.36,1)` |
| Painel lateral/folha | entra 220 · sai 150 | ease-out / ease-in |
| Indicador que desliza | 160 ms | `cubic-bezier(0.2,0.8,0.2,1)` |

Regras: animar só `opacity`, `transform`, `translate`, `scale` (cor em elementos pequenos até 130 ms). Proibido
`transition: all`, largura/altura/posição, `filter`, `backdrop-filter`, shimmer por `background-position`, atraso em
cascata e `will-change` fixo. **Sobre "30 fps":** é o **piso** obrigatório (nenhum quadro acima de 33 ms com CPU 4× mais
lenta); o alvo é a taxa nativa da tela (60 fps). Travar em 30 fps deixaria o movimento pior.
`prefers-reduced-motion`: um único bloco final, durações de 1 ms, sem deslocamento.

## Metas mensuráveis
1. Troca para tela já visitada: conteúdo no primeiro quadro, zero indicador.
2. Primeira visita sem cache: nada por 300 ms; depois, esqueleto estático **no formato final** (sem salto).
3. Painel/modal/menu: 100% com entrada **e** saída.
4. Nenhum quadro > 33 ms (CPU 4×) em: troca de tela, drawer, rail, troca de aba, CRM com 537 leads.
5. Zero `transition: all`/`transition-all`; zero fonte < 11 px; só os raios da tabela; um scroller por região.

---

## Fases e tarefas

### F0 — Linha de base (sem mudar visual)
- [ ] T0.1 Gravar no navegador (CPU 4×): troca de tela, abrir/fechar drawer, recolher rail, trocar conversa, CRM. Registrar quadros longos em `docs/UNSLOP_BASELINE.md`.
- [ ] T0.2 Screenshots "antes" das telas acessíveis nas 6 larguras, 2 temas.
- [ ] T0.3 Teste `tests/unslop-guards.test.ts` com contadores que só podem diminuir (transition-all, `text-[9px]/[10px]`, hex soltos, `!important`, `backdrop-blur`).
**Pronto:** baseline commitado; guardas passando com os valores atuais.

### F1 — Bugs de cascata (primeiro, pequenos)
- [ ] T1.1 `.ux-modal`: a regra genérica de modal anima `translate` e pode **descentralizar** o modal (`styles.css` ~5054 vs ~4346). Excluir `.ux-modal` da regra genérica. Confirmar no navegador antes e depois.
- [ ] T1.2 `@keyframes ux-fade-in` definido duas vezes (~3845 e ~5403): manter só opacidade; criar `ux-rise-in` para conteúdo.
- [ ] T1.3 CRM com rolagem dupla (~4823, ~5247): colunas com `min-height:0`; só `.ux-col-body` rola; remover `calc` de altura.
- [ ] T1.4 Modal sem altura máxima (~5048): `max-height: calc(100dvh - 32px)` com corpo rolável.
**Teste:** um assert por bug. **Pronto:** screenshots do modal e do CRM.

### F2 — Tokens e `motion.css` únicos
- [ ] T2.1 Criar `src/styles/tokens.css` (tabelas acima) importado por `styles.css`; os tokens antigos (`--trax-*`, `--inboxos-*`, `--ux-*`, shadcn slate) viram **alias** temporários para os novos. Cinzas neutros únicos; verde `#00a884` só como `--whatsapp` semântico.
- [ ] T2.2 Criar `src/styles/motion.css` com uma regra por primitivo (drawer, modal, popover, sheet, toast, page-fade) e o bloco de reduced motion; apagar camadas antigas e CSS morto (grep antes, inclusive classes montadas por string).
- [ ] T2.3 Regra global de transição em `button/a/[role]` (~1648) vai para `@layer base`, com lista de propriedades; efeito de pressionar só em `.ux-btn`.
- [ ] T2.4 Remover `transition: all`/`transition-all`, `will-change` fixos e blur sob elementos animados.
**Contratos a revisar:** `tests/unit.test.ts` ~540 e ~779-784 (exige `inboxos-route-enter 180ms`, hoje código morto), `uiux-phase14/16`, `frontend-unification`, `premium-selects`.

### F3 — Primitivos de layout e rolagem
- [ ] T3.1 `src/components/layout/PageShell.tsx`: `PageShell({ children, mode = "page" | "fill", width = "default" | "wide" })` → `main.page-scroll` (único scroller: `flex:1; min-height:0; overflow-y:auto; overflow-x:clip; scrollbar-gutter:stable; overscroll-behavior:contain`) > `.page-body` (gutter, max-width). `PageHeader({ title, description?, actions? })`, sem eyebrow.
- [ ] T3.2 Migrar Dashboard, Follow-up, Agentes, Agenda e Clientes; CRM em `mode="fill"`; Conexões, Configurações e ADM (ADM deixa de rolar o documento).
- [ ] T3.3 Um só dono do padding; `--page-end:24`; safe-area só no dock (ou no composer/rodapé quando não houver dock).
- [ ] T3.4 `--header-h` em topbar, lista, chat, rail e contas; topbar e página no mesmo gutter. Topbar mostra o contexto; o título aparece **uma vez**.
**Atenção:** `tests/product-loading-states.test.ts` exige `inboxos-product-surface` no trecho das views; `responsive-shell` proíbe `overflow-x:hidden` no shell.

### F4 — Primitivos de interação (entrada e saída)
- [ ] T4.1 `Modal` sobre Radix Dialog (180/130 ms, foco e Escape) e migrar: perfil comercial, importar/exportar, QR, prévia de mídia, `ConfirmDialog`, sessões.
- [ ] T4.2 Menus do chat, anexos e reações em Radix Popover/DropdownMenu; barra de resposta e botão "ir ao fim" com saída.
- [ ] T4.3 Rail e barra de contas sempre montados: painel interno desliza (`translateX`), `inert` quando fechado; sem animar `width`. Menu "Mais" e busca mobile em Radix (a busca lista só linhas, um scroller, safe-area).
- [ ] T4.4 `Segmented`/`Tabs` com indicador que desliza (`translateX`, 160 ms) e troca de conteúdo em fade de 130 ms: Dashboard, CRM, Follow-up, Clientes, lista de conversas, Configurações e ADM. Estado ativo sem mudar tamanho.
**Pronto:** cada sobreposição abre e fecha com animação; teclado (Tab, Escape, retorno de foco) conferido.

### F5 — Entradas e carregamento
- [ ] T5.1 Uma única entrada por troca de tela (fade 160 ms no frame). Remover `ux-reveal`, atrasos em cascata, `animate-smooth-in` de bolhas/linhas/badges; animar só mensagem nova (120 ms).
- [ ] T5.2 Presença estática (no máximo 3 pontos em opacidade); fim de pulse/bounce/ping decorativos.
- [ ] T5.3 Padrão único de espera: com cache, nada; sem cache, esqueleto estático no formato final após 300 ms; ação, spinner de 14 px dentro do botão de largura fixa. Cobrir timeline, conversas, histórico, Configurações, ADM e consentimento.
- [ ] T5.4 Boot: esqueleto do shell imediato; assets em paralelo; views pesadas em `lazy` com pré-carga em hover/ocioso, sem fallback quando há snapshot; estender os snapshots a Conexões, Configurações e ADM **com as mesmas regras de isolamento** (`view-snapshot`).
**Teste de isolamento obrigatório:** troca de workspace/usuário apaga tudo; resposta atrasada é descartada.

### F6 — Velocidade
- [ ] T6.1 Um agendador de revalidação (`src/lib/revalidate.ts`) para conversas, mensagens, instâncias e fotos: sem pedido duplicado em andamento, intervalo mínimo no `focus`, pausa com aba oculta, polling longo só com realtime caído. Medir pedidos/minuto antes e depois.
- [ ] T6.2 Edições do CRM, follow-up e clientes com atualização otimista e desfazer em caso de erro (sem recarregar a tela inteira).
- [ ] T6.3 Listas longas: `memo` em linhas e bolhas com callbacks estáveis, `useDeferredValue` na busca, "mostrar mais" (50–100) em CRM e Clientes, `content-visibility:auto`.
- [ ] T6.4 **[BACKEND]** Separar a sincronização de contatos do `GET /api/crm/` (job ou `POST` com intervalo mínimo) para o CRM poder ser pré-carregado. Exige revisão de permissão (`crm.manage`).

### F7 — Tela por tela (usar o checklist do Anexo A)
Ordem: **CRM → Dashboard → Inbox (lista, cabeçalho, timeline, composer) → Conexões/QR → Clientes → Follow-up → Agenda → Agentes/Base → Configurações → ADM → Acesso/legal/erros → E-mails.**
Para cada tela:
- [ ] aplicar PageShell/primitivos, medidas e tipografia; remover frases de preenchimento, ícones decorativos e métricas repetidas; um erro aparece **uma vez** (inline **ou** toast);
- [ ] caixas: um nível; listas e tabelas onde há dados (Clientes com colunas certas);
- [ ] tema por token (sem `isDarkMode ? …` novo, sem hex solto);
- [ ] screenshots "depois" nas 6 larguras e 2 temas; teclado; console.

**Toasts (junto com o CRM):** `id` por ação para não empilhar iguais; no máximo 3, sem `expand` permanente quando repetidos; sucesso sem texto genérico "A alteração foi salva"; título conforme o erro (não usar "Conexão indisponível" para arquivo vazio ou JSON inválido) em `ToastProvider.tsx`.

### F8 — Honestidade da interface (pode correr em paralelo à F7)
- [ ] Follow-up: remover "Você será lembrado no prazo definido" (não há envio).
- [ ] Privacidade: "importação de histórico" não tem efeito no servidor — ocultar **ou** **[BACKEND]** implementar (decisão do dono).
- [ ] Empresa: ocultar domínio personalizado, acento visual e ativação white-label até terem efeito.
- [ ] Remover 👍/👎 só-local ou **[BACKEND]** persistir; consertar ou remover sugestões de resposta; indicador de conta desconectada; selo sem clique; `ConsentView` e `FeaturePlaceholder` órfãos.
- [ ] Dashboard **[BACKEND]**: pipeline só de etapas abertas; série e tempo de resposta agregados no banco (hoje podem ser cortados).

### F9 — Fechamento
- [ ] Remover aliases antigos; guardas da T0.3 nas metas finais.
- [ ] Repetir a medição da F0 e comparar; relatório PASS/FAIL/BLOCKED por tela.
- [ ] Atualizar README e este plano.

## Foco de revisão (o que mais pode quebrar para o usuário)
1. Trocar de conversa/workspace durante animação ou envio: nada pode vazar para outro chat ou tenant.
2. Fechar painel com formulário preenchido ou durante o salvamento: não perder texto nem enviar duas vezes.
3. Teclado e leitor de tela em modais/menus migrados: foco preso e devolvido.
4. Celular com teclado aberto, 320 px e paisagem: rodapé de drawer e composer visíveis.
5. Reduced motion: tudo abre e fecha (a desmontagem não pode depender da animação).

## Entrega e ordem
F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 → F9 (F8 em paralelo à F7). F1 a F5 mexem nos mesmos arquivos
(`styles.css`, shell): **executar em série**. Na F7, telas diferentes ainda compartilham `ProductViews.tsx`
(5,5 mil linhas): ao começar cada tela, mover a view para o próprio arquivo em um commit separado, sem mudar comportamento.

**Pré-requisito recomendado:** encerrar o PR nº 1 antes da F2, para o diff do unslop não se misturar com ele.

---

## Anexo A — Checklist completo do que está com cara de IA ou precisa de correção

Linhas citadas referem-se ao código no momento da auditoria e podem se deslocar.

### A.1 Movimento e carregamento (F1, F2, F4, F5, F6)

- [ ] **MOV-01** **Bug de cascata: modal centrado** — Provável modal descentralizado. .ux-modal centraliza com `translate:-50% -50%`, mas a regra genérica de modal vence e anima `translate` até `0 0` com fill `both`, o que anula a centralização. _Evidência:_ styles.css:5054 (translate); 4346-4351 (seletor 0,3,0 vence .ux-modal[data-state=open] 0,2,0 em 5064); 4356-4367; usado em features/inbox/components/ProductViews.tsx:1701. _Correção:_ Excluir .ux-modal da regra genérica (:not(.ux-drawer):not(.ux-modal)) ou centralizar com um wrapper grid. Keyframes de modal não devem tocar a propriedade usada para posicionar. Confirmar no navegador.
- [ ] **MOV-02** **Bug de cascata: ux-fade-in** — @keyframes ux-fade-in está definido duas vezes. A segunda versão adiciona translateY(4px) a overlays, backdrops e à barra de boot, então o fundo escuro desliza e pode deixar uma faixa descoberta no topo. ux-fade-out não tem o mesmo movimento. _Evidência:_ styles.css:3845 e 5403-5412; consumidores em 3773, 4060, 4419, 4438, 4384, 4943 e 5391. _Correção:_ Manter ux-fade-in só com opacity e criar ux-rise-in para conteúdo.
- [ ] **MOV-03** **Camadas de animação sobrepostas** — [role=dialog] e [data-state] recebem 4 ou 5 regras (inboxos-enter, dialog-enter, ux-pop, ux-modal, ux-drawer/sheet). O resultado depende de especificidade e ordem. auth-card, route-shell e drawer também estão duplicados. As classes animate-in e duration-500 de sheet.tsx perdem para o CSS fora de @layer. _Evidência:_ styles.css:1670-1681, 3183-3199, 4320-4388, 3786-3801, 4373-4380, 5483-5489, 847 vs 3203, 503 vs 3329; components/ui/sheet.tsx:24 e a string sheetVariants logo abaixo. _Correção:_ Criar um único bloco motion.css com uma regra por primitivo (drawer, modal, popover, sheet) via classe .ux-*. Apagar 1670-1701, 3183-3283 e as versões antigas de drawer. Retirar os seletores globais por role.
- [ ] **MOV-04** **CSS sem layer vence o Tailwind** — A regra global em button, a e [role] fica fora de @layer. Ela sobrescreve transition-all, transition-[width] e duration-* nesses elementos. translate e scale ficam fora da lista, então os `transition ... scale` dependem de qual regra vence. active:scale(.985) é aplicado a todo botão, inclusive linhas e abas. _Evidência:_ styles.css:1648-1659; 1625 em diante fica após `@tailwind utilities` (styles.css:143). _Correção:_ Mover para @layer base, restringir a color, background-color, border-color, opacity e transform, e aplicar o efeito de pressionar só em .ux-btn.
- [ ] **MOV-05** **Cara de IA: entradas empilhadas e em cascata** — Cada troca de tela soma route-shell (260ms), view-in (260ms), tabpanel (220ms), ux-reveal (360ms, atrasos de até 160ms), linhas com atraso de até 90ms e animate-smooth-in interno. O conteúdo sobe várias vezes e o efeito parece lento e genérico. Com fill `both`/forwards, o transform retido nos wrappers pode criar containing block para filhos fixed (hipótese a confirmar). _Evidência:_ styles.css:3329, 3343-3350, 4443-4481, 333-335; features/instances/components/ConnectionManager.tsx:195; routes/__root.tsx:156. _Correção:_ Ter uma única entrada por troca de tela: fade de 160ms só de opacity no conteúdo do frame. Remover ux-reveal, atrasos e tabpanel duplicado. Usar fill `backwards`.
- [ ] **MOV-06** **Cara de IA: bolhas, linhas e badges animando** — Todas as bolhas usam animate-smooth-in. Como o painel remonta com key=activeChat.id, até 50 mensagens animam a cada troca de conversa e o histórico também anima ao paginar. O badge de não lidas e o aviso de lista vazia também fazem pop. _Evidência:_ features/inbox/components/MessageBubble.tsx:477,629; InboxShell.tsx:719-721 e 777; ConversationRow.tsx:207; MessageTimeline.tsx:289; useMessages.ts:153 (limit=50). _Correção:_ Remover a animação do histórico. Animar só mensagem nova (marcar ids recebidos depois da montagem) por 120ms. Tirar o scale-in do badge.
- [ ] **MOV-07** **Cara de IA: pulses, bounce e efeitos decorativos** — 'digitando...' pisca o texto inteiro e há três pontos saltando. media-in anima filter:blur por 320ms e causa repaint, mas o grep não achou uso de .media-content no TSX. Sobram classes sem uso no TSX: hover-lift, page-enter, page-transition, inboxos-panel-enter, animate-popover, animate-toast-out, chat-action-menu e media-preview-backdrop. _Evidência:_ ChatHeader.tsx:262-264; ConversationRow.tsx:171-175; MessageTimeline.tsx:325-327; styles.css:350-358, 470-495, 1675-1721, 3244-3283. _Correção:_ Deixar o texto de presença estático e manter no máximo um indicador de 3 pontos só com opacity. Apagar o CSS morto depois de um grep final, inclusive em classes montadas dinamicamente.
- [ ] **MOV-08** **Painéis sem saída: navegação e laterais** — O rail lateral monta e desmonta de uma vez no botão de recolher e a AccountsSidebar aparece ou some ao trocar de view. O menu 'Mais' mobile e a busca mobile também desmontam sem saída. _Evidência:_ InboxShell.tsx:465, 476, 837-839; MobileDock.tsx:93-95; styles.css:1553-1567. _Correção:_ Manter o rail montado, animar o painel interno com translateX (200ms entrada, 140ms saída) e ajustar a largura sem transição, uma vez só, com inert quando fechado. Menu e busca passam para Radix DropdownMenu/Dialog para ganhar exit via data-state.
- [ ] **MOV-09** **Painéis sem saída: menus e popovers caseiros** — O menu do chat, o menu de anexos, o seletor de reação, a barra de resposta, as respostas rápidas e o botão de rolar para o fim somem de uma vez. Os que usam animate-smooth-in entram animados; o de reação nem isso. _Evidência:_ ChatHeader.tsx:398-404; MessageComposer.tsx:427, 487-493, 621; MessageBubble.tsx:291, 362; MessageTimeline.tsx:342. _Correção:_ Usar Radix Popover/DropdownMenu, que já recebe ux-pop-in/out. Para a barra e o botão, usar um wrapper Presence com data-state e saída de 120ms só em opacity e transform.
- [ ] **MOV-10** **Painéis sem saída: modais caseiros** — Vários modais usam `if (!open) return null` ou montagem condicional, sem saída. QR, ImportExport e Perfil usam backdrop-blur com transition-all. Os modais lazy usam Suspense fallback={null}, então o primeiro clique fica sem resposta até o chunk chegar. _Evidência:_ BusinessProfileModal.tsx:163-174; ImportExportModal.tsx:87,250; QrCodeDialog.tsx:168-172; MediaPreviewModal.tsx:63; ui/ConfirmDialog.tsx:71-87; SettingsView.tsx:2294-2307; ConnectionManager.tsx:402; InboxShell.tsx:812-835. _Correção:_ Migrar todos para um componente Modal baseado em Radix Dialog (180ms entrada, 130ms saída), mantendo o componente montado com a prop open. Pré-carregar o chunk no hover e no focus.
- [ ] **MOV-11** **Seleção, abas e segmented** — .ux-segment troca fundo e sombra sem indicador contínuo e anima box-shadow, que é paint. Os painéis de CRM, Follow-up, Clientes e ADM trocam o conteúdo de uma vez ou repetem a entrada. Os filtros de conversa usam transition-all e mudam a borda só no estado inativo, o que desloca 1px (inferido pelas classes). A troca de view é feita com setState e navigate, sem transição de saída. _Evidência:_ styles.css:4541-4580; ProductViews.tsx:1135-1151, 2088-2099, 5258-5269; ConversationList.tsx:160-274; SystemAdminView.tsx:505-558; InboxShell.tsx:233-240. _Correção:_ Criar um componente Segmented com thumb absoluto movido por translateX em 160ms; a largura muda sem transição ou o thumb usa clip-path. .ux-tab já anima o sublinhado (styles.css:4192-4205) e serve de padrão. Manter borda transparente no estado ativo. O conteúdo ganha apenas fade-in de 120ms, sem saída. Usar startTransition na troca de view.
- [ ] **MOV-12** **Animação de layout e transition-all** — A AccountsSidebar anima width e padding de 68 para 280px no hover e no foco, causando reflow do chat a cada frame e conteúdo que troca no meio do movimento. styles.css:1079 também anima width. Há 5 `transition: all` no CSS e 44 linhas com transition-all. _Evidência:_ AccountsSidebar.tsx:57-58 e 68; styles.css:1077-1080, 2017, 2064, 2257, 2321, 2355; MessageBubble.tsx:659 (todas as bolhas), 873, 908; components/ui/progress.tsx:18; components/ui/sidebar.tsx:225-299. _Correção:_ Expandir a sidebar como overlay (largura reservada de 68px, painel de 280px revelado com transform) e abrir por clique ou pin. Trocar transition-all por transition-colors, opacity ou transform. Criar teste que falhe com `transition: all` ou transition-all.
- [ ] **MOV-13** **Blur, will-change e scroll suave** — Há backdrop-blur no topbar permanente, em overlays em tela cheia (que ficam caros durante o fade) e no menu mobile. will-change é permanente em popper, drawer, overlay, hover-lift e auth-card. scroll-behavior:smooth em body e na timeline pode atrasar o salto ao trocar de conversa (inferência). _Evidência:_ InboxShell.tsx:500-501; ui/dialog.tsx:24; MessageBubble.tsx:873; styles.css:1563, 1669, 1716, 3772, 3788, 844, 253-269, 3269-3277. _Correção:_ Usar overlay sólido sem blur e topbar opaco. Remover os will-change fixos. Deixar o scroll suave só no scrollTo acionado pelo usuário; a troca de chat usa behavior:'auto'.
- [ ] **MOV-14** **Reduced motion** — A cobertura global existe, mas está repetida em 15 blocos com valores 0.01ms, 1ms e none. Em 3284-3300 há transform:none!important em dialogs, que não protege a centralização feita via translate. _Evidência:_ styles.css:529, 693, 799, 1352, 1412, 1618, 1723, 2620, 3284, 4090, 4389, 4483, 5414, 5473, 5503. _Correção:_ Um bloco final único: durações de 1ms, sem deslocamento, spinners e skeletons estáticos. Conferir que Radix e Presence continuam desmontando.
- [ ] **MOV-15** **Boot e cascata de requisições** — O boot passa por ClientOnly, getSession, Suspense e InboxShell, com três usos de Loading. Se o chunk e a sessão forem rápidos, fica só um fundo vazio. Depois disparam conversas, instâncias, admin/me, branding, assets em série, sync de fotos e, 1,5s depois, prefetch de 5 telas. ProductViews (5.713 linhas) e SettingsView (2.374) são importados de forma estática no shell. Cada apiFetch faz dois imports dinâmicos e getSession. _Evidência:_ routes/index.tsx:9-90; InboxShell.tsx:27, 93-177 (for com await em 150-170), 280; view-snapshot-client.ts:66-100; lib/api-fetch.ts:16-29. _Correção:_ Renderizar de imediato o esqueleto do shell (rail e topbar). Usar Promise.all nos assets. Fazer lazy por view com preload no hover e em idle, sem fallback visível quando houver snapshot. Adiar sync de fotos, admin/me e prefetch com requestIdleCallback.
- [ ] **MOV-16** **Polling e refetch duplicados** — Ao voltar para a aba, focus e visibilitychange chamam reconcile duas vezes e abortam a primeira requisição. Conversas e instâncias também refazem a busca em cada focus, sem throttle. O polling convive com realtime. O comentário diz 'sem polling', mas há setInterval. O sync de fotos roda a cada 60s mesmo com a aba oculta. fetchInstances faz setError(null) mesmo em modo silencioso. _Evidência:_ useMessages.ts:322-348; useConversations.ts:200-215 e 258-262; useInstances.ts:48-51 e 84-92. _Correção:_ Criar um agendador 'revalidate' compartilhado com dedupe de requisição em andamento e mínimo de 10-15s entre focus. Polling de 60-120s só quando o realtime estiver caído. Pausar com a aba oculta. Fotos a cada 10 min ou em idle.
- [ ] **MOV-17** **Recarga ao trocar de tela e a cada ação** — As views são desmontadas na troca e refazem a busca. Os snapshots evitam o estado vazio na maioria dos casos, mas o CRM não é pré-carregado e a primeira abertura sempre mostra esqueleto. O GET do CRM sincroniza contatos e grava no banco antes de responder. Cada ação faz await do refresh completo com busy ligado. Qualquer catch executa viewSnapshots.clear(), e uma falha traz esqueleto a todas as telas. Clientes espera 180ms até na primeira busca. _Evidência:_ InboxShell.tsx:789-797; view-snapshot-client.ts:63-65; server/product/workspace-product.server.ts:345-375; ProductViews.tsx:362-364, 870-902, 5024, 5033-5037. _Correção:_ Separar o sync do GET (job ou POST com throttle). Usar atualização otimista com patch local e revalidação em segundo plano. Usar drop(key) em erro comum e clear() só em troca de tenant ou sessão (ou 401/403). Debounce só quando houver query. Aplicar stale-while-revalidate com TTL de 30-60s.
- [ ] **MOV-18** **Indicadores de carregamento inconsistentes** — Convivem barra .ux-loading (700ms), .ux-delayed (450ms), 20 <Skeleton>, animate-pulse, spinners de 32px com texto e o ícone de relógio girando em mensagem pendente. DataSkeleton parece sem uso (o grep só achou a definição). Há botões que apenas desabilitam, e o refresh pode inserir um indicador no layout. _Evidência:_ styles.css:4407-4439 e 5460-5471; ConversationList.tsx:292-300 e 339-342; MessageTimeline.tsx:196-227; MessageBubble.tsx:596 e 1033; ProductViews.tsx:246, 531-546, 1054, 2063, 3025, 4381, 5229; BusinessProfileModal.tsx:239-241; SettingsView.tsx:2241-2252; features/auth/ConsentView.tsx:131. _Correção:_ Definir um padrão: com cache, nada; sem cache, esqueleto estático com a forma final após 300ms; ação, spinner de 14px dentro do botão com largura fixa. Mensagem pendente usa relógio parado. O refresh usa espaço reservado. Remover DataSkeleton.
- [ ] **MOV-19** **Listas longas e re-render** — A lista do CRM corta em 300 linhas sem avisar (com 537 leads, 237 ficam invisíveis). Clientes renderiza todos os registros sem limite. O quadro filtra filteredLeads para cada etapa em todo render. O grep não achou memo( nos componentes da inbox, nem virtualização ou content-visibility. A busca não usa useDeferredValue. Atualizar a conversa ou digitar re-renderiza InboxShell, a lista e a timeline. _Evidência:_ ProductViews.tsx:1166-1175, 1376, 5158, 5366; ConversationList.tsx, ConversationRow.tsx e MessageTimeline.tsx (sem memo); InboxShell.tsx:694-760 (callbacks inline). _Correção:_ Paginar ou 'mostrar mais' com total visível (50-100) em CRM lista e Clientes. Agrupar por etapa com useMemo. useDeferredValue na busca. memo em ConversationRow e MessageBubble com callbacks estáveis. content-visibility:auto com contain-intrinsic-size nas linhas; virtualizar acima de cerca de 200.
- [ ] **MOV-20** **Plano de implementação (ordem)** — As correções precisam de sequência para não regredir a cascata. _Evidência:_ Itens acima; testes que leem styles.css: tests/unit.test.ts, uiux-phase14, uiux-phase16, frontend-unification, responsive-shell e admin-presentation. _Correção:_ F0: gravar baseline no DevTools Performance (CPU 4x) em troca de view, drawer, sidebar e CRM com 537 leads. F1: corrigir modal e ux-fade-in. F2: tokens e motion.css único, remover duplicatas e CSS morto, ajustar unit.test:782. F3: remover entradas empilhadas, animações do histórico e transition-all. F4: Presence/Radix para laterais, menus e modais; Segmented com thumb; sidebar overlay. F5: padrão de loading, cache e ações otimistas, GET do CRM sem sync, revalidação com dedupe. F6: lazy com preload, memo e paginação ou virtualização. Aceite: nenhum frame acima de 33,3ms nas animações com CPU 4x (meta ideal de 60fps; 30fps é o piso, sem limitar artificialmente), feedback ao clique em menos de 100ms, nenhum indicador em retorno com cache e saída visível em todo painel.

### A.2 Layout, alinhamento, caixas e rolagem (F1, F3, F7)

- [ ] **LAY-01** **Gutters (P0)** — Padding de página duplicado em 7 telas: o scroller tem o padding de .inboxos-page e o filho .ux-container soma outro. Em cerca de 1440px dá uns 72px nas laterais e 52px no topo. Em 375px dá 30px por lado, contra 12px da topbar mobile. _Evidência:_ styles.css:548-556 (clamp 16-24px e gutter 16-32px); 704-705 (16px 14px no mobile); 3416-3423 (28px clamp(16px,3vw,40px) 96px). .ux-page (3411) não zera o padding. Uso em PV:492-493, 1021-1022 e demais views; SettingsView.tsx:1096-1098. _Correção:_ Um único dono do padding. O scroller fica com padding 0. O contêiner interno usa padding: var(--sp-6) var(--page-gutter) var(--page-end). Apagar as regras de 704 e 1431.
- [ ] **LAY-02** **Dock e safe area (P0)** — Cerca de 178px de vazio no fim das páginas abaixo de 1024px (82px mais 96px). O dock é irmão flex com position: relative e não cobre o conteúdo, portanto a reserva é desnecessária. O safe-area inferior ainda é contado no dock e na página. _Evidência:_ styles.css:1430-1433 vence 548 e 704 no padding-bottom (especificidade 0,2,0); 3420 (96px); 1503-1512 (dock relative, flex:none); 2567-2569 (padding do dock que vence 1509); IS:759-768. _Correção:_ --page-end: 24px em todos os breakpoints. env(safe-area-inset-bottom) somente no dock. Quando o dock estiver oculto, somente no composer e no rodapé de drawer.
- [ ] **LAY-03** **Scroll e largura (P0)** — max-width de 1480px está no próprio elemento que rola. Em 1920px com o rail de 228px sobram cerca de 106px de cada lado: a barra fica no meio da tela e a roda do mouse não rola nas margens. No CRM, .ux-container--wide (max-width:none) continua limitado a 1480px. Nas outras telas o limite real é 1320px. _Evidência:_ styles.css:551-552, 3418, 4803-4805; PV:492, 1021. _Correção:_ O scroller ocupa 100% da largura. max-width fica só no .page-body (1320px; variante wide sem limite).
- [ ] **LAY-04** **Alinhamento topbar x conteúdo** — A topbar usa 16px e o conteúdo é centralizado em até 1320px com cerca de 72px de recuo. O título nunca alinha com o botão ou o título da topbar. No mobile são 12-20px contra 30px. _Evidência:_ IS:498 (h-14 px-4); styles.css:1437 (.mobile-topbar com clamp(0.75rem,3vw,1.25rem)); 548-556 e 3416-3420. _Correção:_ Topbar e .page-body usam o mesmo --page-gutter. Decidir a âncora: conteúdo alinhado à esquerda com max-width (recomendado) ou topbar com o mesmo contêiner centralizado.
- [ ] **LAY-05** **Alinhamento de cabeçalhos no Inbox** — As linhas divisórias dos cabeçalhos ficam em degrau. A topbar tem 56px. O cabeçalho do chat tem 60px com px-5. A lista tem uma linha de 56px dentro de um bloco p-3.5 com borda própria. O rail usa uma linha de 44px após py-3.5. _Evidência:_ IS:498; ChatHeader.tsx:154; ConversationList.tsx:68 e 80; AccountRail.tsx:97 e 105; AccountsSidebar.tsx:62 (p-4). _Correção:_ --header-h: 56px nos cabeçalhos de topbar, chat, lista, rail e contas, com px 16px. Busca e chips ficam numa segunda faixa de altura fixa.
- [ ] **LAY-06** **Admin** — A página inteira rola e o header não é sticky. O header usa px-5/sm:px-8 em largura total. O main usa até 1600px centralizado e o conteúdo usa px-3/sm:px-6. Há 8px de desalinhamento (32 contra 24, ou 20 contra 12) e mais acima de 1600px. pb-24 deixa 96px vazios. _Evidência:_ routes/admin.tsx:85-96 e 157; SystemAdminView.tsx:459. _Correção:_ Usar o mesmo PageShell: raiz h-dvh flex-col overflow-hidden, header de 56px fixo e região de scroll própria. Mesmo gutter e mesmo max-width no header e no corpo.
- [ ] **LAY-07** **Conexões** — Scroll aninhado: o wrapper overflow-auto envolve um div overflow-y-auto. O flex-1 interno não tem efeito porque o pai não é flex. A tela usa max-w-5xl, p-6/md:p-8, space-y-6 e h2 text-lg bold, fora do padrão das outras (1320px, h1 de 20px com peso 600). _Evidência:_ IS:674; features/instances/components/ConnectionManager.tsx:195-200. _Correção:_ Trocar os dois divs por PageShell com .page-header e .ux-h1.
- [ ] **LAY-08** **CRM: scroll duplo** — A cascata final deixa .ux-board como grid com overflow visible. A coluna continua com max-height calc(100dvh - 260px) e corpo rolável dentro do main que também rola. O número 260 é fixo e quebra quando o cabeçalho quebra linha ou aparecem avisos, o dock ou a barra de ações em massa. _Evidência:_ Vence em styles.css:5247-5253 (sobre 4810 e 4952); max-height em 4823 não é sobrescrito por 4955 nem 5254; .ux-col-body 4845-4851. _Correção:_ No CRM, usar PageShell em modo fill: main flex-col overflow-hidden; cabeçalho e toolbar flex:none; board flex:1 e min-height:0; coluna height:100% e min-height:0; só .ux-col-body rola. Remover o calc. Abaixo de 640px de altura, voltar à rolagem única da página.
- [ ] **LAY-09** **CRM: camadas mortas e largura** — Há três definições de board (flex com scroll horizontal, CRM v2 e grid). O CSS de scroll horizontal e scroll-snap está morto. Colunas de .ux-col (flex 300px, 232-380px) são anuladas. fitsBoard usa 210px por etapa e ignora o gap de 12px, então a coluna real pode ter cerca de 198px. boardWidth=0 assume que cabe e pode piscar no mobile. _Evidência:_ styles.css:4810-4833, 4952-4966, 5247-5261; PV:1011 e 1159-1167. _Correção:_ Manter uma só regra: grid sem scroll horizontal. Calcular (width - 12*(n-1))/n >= 220. Antes de medir, usar container query em vez de assumir que cabe. Valores finais do card: padding 10px 12px e raio 9px (4995) passam a var(--sp-3) e var(--r-sm).
- [ ] **LAY-10** **Modal sem altura máxima** — .ux-modal é centralizado sem max-height nem overflow. Em paisagem ou em 320px com teclado aberto, o topo e as ações podem ficar inalcançáveis. _Evidência:_ styles.css:5048-5062; uso em PV:1700-1702. _Correção:_ max-height: calc(100dvh - 32px); display:flex; flex-direction:column. O corpo recebe min-height:0 e overflow-y:auto; cabeçalho e rodapé ficam flex:none.
- [ ] **LAY-11** **Espaçamento de painéis, drawers e modais** — Cada cabeçalho tem um recuo: panel-head 14/18, panel-body 18, section 22/24, settings-section-head 16/20, drawer-head 20/24/18, drawer-foot 14/24, toolbar 12/14, tabs 0/20, stats 6/18, onboard 24/18, col-head 10/8/10/14. O texto não alinha verticalmente dentro do mesmo painel. .ux-drawer-head não considera o safe-area superior. _Evidência:_ styles.css:3477-3489, 3737-3744, 5311-5316, 3802-3825, 4653-4660, 4156-4163; .ux-stats por volta de 3945. _Correção:_ --panel-x: 16px (20px a partir de 640px) para head, body, section, toolbar, tabs, stats e drawer. Padding vertical de 12px no cabeçalho e 16px no corpo. Drawer-head com padding-top max(16px, env(safe-area-inset-top)).
- [ ] **LAY-12** **Caixas aninhadas** — Há card dentro de card, contra o comentário do próprio CSS. A timeline do cliente é uma lista com max-h-64 e rolagem dentro do drawer que já rola, e cada item é uma caixa com borda. No admin há seções rounded-2xl p-4 repetidas, com grids internos de gaps diferentes. O visual fica com cara de template gerado por IA. _Evidência:_ PV:5492-5496; styles.css:3470; SystemAdminView.tsx:233 e 1244. _Correção:_ Itens viram linhas separadas por border-top, sem fundo nem raio. Remover max-h-64 e overflow para sobrar uma rolagem por drawer. No máximo um nível de caixa.
- [ ] **LAY-13** **Alturas de controles** — Convivem muitas alturas: .ux-btn 36, .ux-input 38, .ux-segment 30 mais 3px de padding, settings-nav 34, col-menu 30, .inboxos-action e .inboxos-field 40, Button h-9/10/11, Input min-h-10, Select min-h-11, tabs h-9, admin tab 42, ações do chat 40 e topbar 44. Como as classes próprias vêm depois dos utilitários, min-height 40 anula h-9. Busca, select e botão ficam desalinhados na mesma toolbar. _Evidência:_ styles.css:3585, 3690, 4553, 5301, 4984-4987, 592-624, 667-670, 2524-2535; components/ui/button.tsx:21-24, input.tsx:11, select.tsx:22, tabs.tsx:15. _Correção:_ --control-sm 32, --control-md 36 (padrão para botão, input, select e segmented com altura externa de 36), --control-lg 40. Em pointer:coarse, tudo vai a 44.
- [ ] **LAY-14** **Raios** — 30 declarações distintas de raio no CSS e 6 escalas no TSX. Os tokens se sobrepõem: --inboxos-radius 16 e control 12 contra --ux-radius 12 e sm 8. Há ainda 15px no mobile. _Evidência:_ styles.css:538-539, 3385-3386, 716-718; contagens do grep em current. _Correção:_ Usar somente 6, 8, 12 e 999. Controles 8, painéis, modais e cards grandes 12. Mapear --radius-* do @theme para rounded-md/lg/xl convergir. Apagar os aliases antigos.
- [ ] **LAY-15** **Escala tipográfica** — 30 tamanhos no CSS (de 8 a 38px, incluindo 11.5, 12.5, 16.5, .56 e .62rem) e mais de 100 textos arbitrários de 9-11px no TSX. SettingsView concentra 30 linhas com 9-11px e MessageBubble 15. Eyebrow de 9px em caixa alta com tracking é um padrão típico de IA. _Evidência:_ SettingsView.tsx:2316-2318; styles.css:3434-3450; grep por arquivo. _Correção:_ Escala 11/12/13/15/20, com 16 nos inputs de toque para evitar zoom no iOS. Piso de 11px. Remover eyebrows e padronizar o título de página em .ux-h1.
- [ ] **LAY-16** **Ritmo vertical e grids** — 21 valores de gap no CSS (incluindo 1, 3, 7, 9 e 11px). O TSX usa passos de 1.5 e 2.5 com frequência, e o admin mistura space-y-5, my-4, mb-3 e gap-2. _Evidência:_ Grep de gap; SystemAdminView.tsx:459 e 1225-1245; styles.css:3419-3422 e 3490-3492. _Correção:_ Escala 4/8/12/16/24/32. 24px entre blocos de página, 16px entre painéis e 8px entre controles. Usar gap no pai em vez de mt/mb.
- [ ] **LAY-17** **Busca mobile** — O overlay tem campo de busca próprio e renderiza ConversationList inteira, que traz outro cabeçalho, busca e chips, dentro de um segundo contêiner overflow-y-auto. O overlay também não tem safe-area superior. _Evidência:_ IS:826-905; ConversationList.tsx:68-83 e 291. _Correção:_ Renderizar só as linhas (ConversationRow) ou dar à lista uma prop hideHeader. Região flex-1 min-h-0 com um único scroller. Cabeçalho com padding-top env(safe-area-inset-top).
- [ ] **LAY-18** **Configurações: navegação** — Abaixo de 1024px a navegação de seções quebra em várias linhas e some ao rolar. No desktop ela é sticky com top:8px e herda o padding duplo. _Evidência:_ styles.css:5278-5305. _Correção:_ Abaixo de 1024px: sticky top:0, nowrap, overflow-x:auto e fundo opaco. Desktop: top: var(--sp-6).
- [ ] **LAY-19** **Estado vazio e esqueleto** — O estado vazio do chat usa ícone de 56px, p-12 e duas frases centralizadas, um padrão genérico de IA, e a frase explica o óbvio. FeaturePlaceholder usa um terceiro sistema de padding (p-5/8/10, max-w-5xl) e não achei importador dele. _Evidência:_ IS:766-777; FeaturePlaceholder.tsx:11-12. _Correção:_ Ícone de 24px e uma linha curta. Confirmar com grep e remover FeaturePlaceholder se estiver sem uso.
- [ ] **LAY-20** **Plano: PageShell com scroll próprio** — Não existe um componente de layout. Cada tela repete 5 ou 6 classes (inboxos-page, product-surface, ux-page, flex-1, overflow-auto, ux-container) que disputam entre si. _Evidência:_ PV:492-494, 1021-1023, 2029-2031, 2994-2996, 4349-4351, 5173-5175; SettingsView.tsx:1096-1099. _Correção:_ Ordem: 1) tokens. 2) PageShell: main.page-scroll{flex:1;min-width:0;min-height:0;overflow-y:auto;overflow-x:clip;overscroll-behavior:contain;scrollbar-gutter:stable} > .page-body{max-width:var(--page-max);margin-inline:auto;padding:var(--sp-6) var(--page-gutter) var(--page-end);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-6)}. Variantes wide e fill (CRM, sem scroll na página). 3) Migrar as 7 views, Conexões e Admin. 4) Mudar o CRM e o modal. 5) Unificar painéis, controles, raios e tipografia. 6) Apagar as camadas antigas. 7) QA em 320, 375, 390, 640, 768, 899/900, 1023/1024, 1280, 1440 e 1920, além de paisagem com menos de 540px de altura. Em 320px, o padding atual deixa só cerca de 260px úteis; com gutter de 12px ficam 296px.

### A.3 Problemas visuais gerais do aplicativo (F2)

- [ ] **GER-01** São três ou quatro sistemas de tokens convivendo: o shadcn em oklch azul-ardósia (src/styles.css:64-137), o --trax-* de vidro (styles.css:362-372), o --inboxos-* com raio de 16/12px (styles.css:539-545) e o --ux-* das telas de produto (styles.css:3411+). Há ainda --motion-* e --inboxos-motion-* duplicados (styles.css:1627). O arquivo tem 5.507 linhas e 61 !important.
- [ ] **GER-02** O app tem duas linguagens visuais. Dashboard, CRM, Clientes, Follow-up, Calendário e Agentes usam o sistema ux-*. Inbox, Conexões, rail, modais e QR usam Tailwind com hex solto (InboxShell.tsx:412; ConversationList.tsx:65; ImportExportModal.tsx:257; ConnectionManager.tsx:197-257). Ao trocar de tela, parece outro produto.
- [ ] **GER-03** Há dezenas de pretos e cinzas quase iguais: #080809, #0a0a0b, #0b0b0c, #0e0e13, #111115, #111216, #121215, #14141a, #16161e, #181820, #181822, #1a1a22, #22222e, #2a3942 e outros. Parte é cinza azulado e parte é neutra.
- [ ] **GER-04** O verde do WhatsApp aparece como #00a884 fixo (52 ocorrências nos componentes), como var(--whatsapp) com color-mix e como #25D366 no gráfico (ProductViews.tsx:654). Somam-se âmbar (40 usos), rose, red, indigo, emerald e sky sem regra semântica. Rose e red fazem o mesmo papel de erro.
- [ ] **GER-05** Raios sem escala nos componentes: rounded-xl 118, rounded-lg 71, rounded-full 47, rounded 29 e rounded-md 16, além de 2xl e 3xl no QR (QrCodeDialog.tsx:177). O CSS tem cerca de 30 valores de border-radius, de 2px a 26px.
- [ ] **GER-06** Há cerca de 20 tamanhos de texto (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14px e outros) e muito texto de 9 a 10px. O CSS ainda tem tamanhos de 0.5rem a 0.68rem.
- [ ] **GER-07** Inter e Plus Jakarta Sans são carregadas do Google Fonts (routes/__root.tsx:124). A pilha --font-sans começa em Inter, o visual padrão de template (styles.css:147-150).
- [ ] **GER-08** O cabeçalho se repete três vezes: eyebrow 'HOME', 'GESTÃO' ou 'AUTOMAÇÕES' com título na topbar (InboxShell.tsx:529; navigation.ts), o mesmo título em H1 logo abaixo e um subtítulo explicativo (ProductViews.tsx:497, 2034, 2999, 4354, 5180). No mobile, o eyebrow volta (InboxShell.tsx:626). O grupo 'HOME' com CRM e Clientes e o grupo 'GESTÃO' com Inbox não seguem lógica clara (navigation.ts).
- [ ] **GER-09** Há animação em tudo: revelação escalonada de painéis e linhas ao montar (styles.css:4440-4480), animate-smooth-in nas telas e vazios, scale no :active de todo botão, animate-ping, bounce e pulse. São cerca de 51 usos de animate- nos componentes. O 'transition: all' aparece em styles.css:2017-2355.
- [ ] **GER-10** O vidro e o blur são decorativos: 14 usos de backdrop-blur nos componentes, além dos tokens de vidro. Há !important em .dark .app-topbar e .conversation-panel, que sobrescreve as cores definidas no JSX (styles.css:750-756).
- [ ] **GER-11** A rolagem é forçada como suave em body, main, timeline e outras áreas (styles.css:~179-197), com scrollbar customizada global (styles.css:222-258). overflow-wrap:anywhere em todo p, h, label e strong pode quebrar palavras no meio (styles.css, bloco .inboxos-page e .inbox-app, logo após 545).
- [ ] **GER-12** Toasts: todo sucesso sem descrição ganha 'A alteração foi salva.' (ToastProvider.tsx, método success), inclusive em ações que não salvam nada. Todo erro enviado por networkError recebe o título 'Conexão indisponível' (ToastProvider.tsx, networkError), mesmo em 'Este arquivo está vazio' (MessageComposer.tsx:379) ou JSON inválido na importação (ImportExportModal.tsx:240).
- [ ] **GER-13** Os erros aparecem em dobro: a ErrorBox fixa na página ('Não foi possível concluir') e o toast com a mesma mensagem (ProductViews.tsx:260-270 com 367, 885, 1949, 2672, 4268, 5025). O Toaster ainda usa expand e mostra até 4 empilhados (components/ui/sonner.tsx).
- [ ] **GER-14** O estado vazio segue sempre a mesma fórmula, com ícone gigante apagado ou quadrado de ícone, título e frase de ajuda (InboxShell.tsx:778-787 e 880-897; ConversationList.tsx:311-322; MessageTimeline.tsx:229-236; ConnectionManager.tsx:233-253).
- [ ] **GER-15** Navegação: o menu mobile mostra 'Agentes' para o papel 'agent', que o rail esconde (AccountRail.tsx:134 e MobileDock.tsx:24-30). Os nomes mudam entre desktop e mobile (Dashboard/Início, Calendário/Agenda, Configurações/Ajustes). O rail usa sempre o logo da plataforma, mesmo com logo do workspace na topbar (AccountRail.tsx:112).

### A.4 Problemas gerais de ADM, acesso e e-mails (F2, F7)

- [ ] **ADM-01** Prioridade 1, risco: 'Solicitar exclusão' do workspace sem confirmação nem cancelamento (SettingsView.tsx:2113). Remover membro (1852), encerrar outras sessões (1552), revogar dispositivo e rotacionar segredo também não confirmam. O ConfirmDialog já existe e é usado só em partes do ADM.
- [ ] **ADM-02** Prioridade 2, controles sem efeito: acento visual, white-label, domínio personalizado, importação de histórico e a tela OAuth órfã. Convite para conta existente não tem tela de aceite.
- [ ] **ADM-03** Prioridade 3, bugs visíveis: 'sessãoões' e 'conexãoões' (SettingsView.tsx:532, 1582, 2364); métricas 'instances' e 'activeMembers' cruas no ADM; recuperação de senha avança mesmo quando a API falha.
- [ ] **ADM-04** Feedback duplicado e errado: aviso inline mais toast em Configurações e ADM; todo sucesso ganha 'A alteração foi salva.'; todo erro vira 'Conexão indisponível' (components/ui/ToastProvider.tsx:68-80).
- [ ] **ADM-05** Texto de desenvolvedor na interface: backend, E.164, PII, billing, control plane, Resend, 'cobrança fictícia', 'Minuta técnica', 'Operador configurado' e 'A resposta inicial nunca revela...'.
- [ ] **ADM-06** Valores crus em inglês ou UUIDs: papéis, status, tipos de solicitação, ações de auditoria, tipos de bloco e IDs de usuário, workspace e campanha.
- [ ] **ADM-07** Molde repetido de eyebrow, título e subtítulo, ou ícone em quadrado, título e parágrafo: Configurações, autenticação, modais, 404/500 e ADM. Quase todo título ganha uma frase explicativa redundante.
- [ ] **ADM-08** Excesso de caixas iguais, muitas aninhadas, com todas as ações no mesmo peso. No ADM, quase todo botão usa o mesmo contorno e falta hierarquia entre primário e destrutivo.
- [ ] **ADM-09** Pelo menos quatro sistemas visuais: ux-* nas Configurações, ternários próprios no ADM, auth-* e legal-* na autenticação, Tailwind zinc fixo nos erros; a tela OAuth órfã usa shadcn.
- [ ] **ADM-10** Escalas inconsistentes: textos de 9 a 14px, botões de 36, 40 e 44px, e raios de 8, 10, 12, 16, 24px e rounded-3xl.
- [ ] **ADM-11** Temas inconsistentes: páginas de erro sempre claras, páginas legais e modal de desconexão sempre escuros.
- [ ] **ADM-12** Marca inconsistente: 'Inbox OS' (lib/platform-brand.ts) contra 'InboxOS' (templates.ts, error-page.ts, legal-documents.ts). A meta descrição usa 'Central premium de atendimento e operações' (__root.tsx).
- [ ] **ADM-13** Estados faltando: listas do ADM sem estado vazio. Nas Configurações, falhas parciais ao carregar empresa, membros ou privacidade são engolidas por allSettled e aparecem como vazio (SettingsView.tsx:714-766).
- [ ] **ADM-14** Método: inventário feito só por leitura de código, sem executar app, rede ou banco. 'ok' significa ligado a um endpoint ou handler real, não testado em funcionamento. Nem todos os handlers do servidor foram lidos por inteiro. Linhas sem prefixo nas entradas de Configurações e ADM referem-se a SettingsView.tsx e SystemAdminView.tsx; caminhos relativos a src/.

### A.5.1 Navegação (rail, topbar e dock mobile) (F7)

- [ ] **P01-01** Eyebrow em caixa alta de 9px com tracking sobre o título, repetido pelo H1 da página (InboxShell.tsx:524-545).
- [ ] **P01-02** Rótulos de grupo genéricos HOME, GESTÃO e AUTOMAÇÕES (navigation.ts, appNavigationGroups).
- [ ] **P01-03** Os metadados 'description' e 'implemented' de cada view têm tom de gerador, como 'persistente e isolado por workspace' (navigation.ts).

### A.5.2 Dashboard (F7)

- [ ] **P02-01** Cinco KPIs idênticos com rótulo, número e legenda (ProductViews.tsx:~548-590).
- [ ] **P02-02** Os painéis laterais repetem Conversas ativas, Não lidas, Mensagens, Leads e Follow-ups já mostrados nos KPIs (ProductViews.tsx:~700-765).
- [ ] **P02-03** Textos prontos de 'insight', como 'Considere redistribuir' e 'Um agente pode responder dúvidas comuns fora do horário', este sem base em horário (ProductViews.tsx:443 e 452+). O percentual compara 3 dias com os 4 anteriores, mas o texto diz 'semana anterior'.
- [ ] **P02-04** 'Como está a operação do workspace agora.' e 'Tudo em dia' são frases de preenchimento (ProductViews.tsx:497 e 677).
- [ ] **P02-05** A grade do gráfico é branca fixa, invisível no tema claro. O tooltip é sempre escuro e usa outro verde (ProductViews.tsx:611, 641, 654).
- [ ] **P02-06** O esqueleto de carregamento tem layout diferente do conteúdo final.

### A.5.3 Inbox: contas WhatsApp e lista de conversas (F7)

- [ ] **P03-01** Dois campos de busca visíveis ao mesmo tempo no desktop, com placeholders diferentes (InboxShell.tsx:~556; ConversationList.tsx:92).
- [ ] **P03-02** Seis chips em pílula com rolagem horizontal e o mesmo bloco de classes copiado seis vezes (ConversationList.tsx:147-287). O chip ativo perde a borda.
- [ ] **P03-03** O título 'Conversas' com pílula de contagem se soma ao título 'Inbox · N conexões ativas' da topbar.
- [ ] **P03-04** Cada linha tem selo verde com o nome da instância, borda verde na seleção e avatar verde de fallback (ConversationRow.tsx:69, 100, 127-137).
- [ ] **P03-05** O ícone de upload representa importar e exportar (ConversationList.tsx:142).
- [ ] **P03-06** A barra de contas tem seus próprios cinzas azulados em hex e o rótulo 'WA' quando recolhida (AccountsSidebar.tsx:60-139).
- [ ] **P03-07** No estado vazio do chat, o ícone de 56px e o texto 'Selecione uma conversa na lista ao lado ou selecione outra conta…' são redundantes (InboxShell.tsx:778-787).

### A.5.4 Inbox: cabeçalho do chat e menus (F7)

- [ ] **P04-01** Ações duplicadas: dados do contato tem três entradas, e fixar e IA têm duas cada (ChatHeader.tsx:173, 303, 327, 341, 410-470).
- [ ] **P04-02** Estilos misturados: pílula 'IA ativa' com borda verde, ícone verde de CRM, fixar âmbar e hovers em três paletas (ChatHeader.tsx:291-390).
- [ ] **P04-03** Há um menu feito à mão enquanto o CRM usa o DropdownMenu do Radix.

### A.5.5 Inbox: timeline e balões (F7)

- [ ] **P05-01** Reações como ícones Phosphor coloridos no lugar de emoji, com o comentário '0 Emojis' e o fallback Sparkle, símbolo típico de IA (MessageBubble.tsx:181 e 1053).
- [ ] **P05-02** Botão flutuante com a frase longa 'Ir para as mensagens mais recentes' (MessageTimeline.tsx:354).
- [ ] **P05-03** O separador de data em caixa alta usa a paleta azulada do WhatsApp (#182229, #8696a0), fora do restante do app (MessageTimeline.tsx:~258).
- [ ] **P05-04** 'Documento • Clique para abrir' (MessageBubble.tsx:949) e 'Envie uma mensagem abaixo para iniciar o contato' são textos de ajuda redundantes.
- [ ] **P05-05** O aviso de offline promete 'reconectando automaticamente' com base apenas no estado de rede do navegador (MessageTimeline.tsx:179).

### A.5.6 Inbox: compositor (F7)

- [ ] **P06-01** Frases enlatadas e inventadas: 'Temos condições especiais esta semana', 'O prazo estimado é de 3 a 5 dias úteis', 'Consigo agilizar para entrega amanhã' e uma com emoji (MessageComposer.tsx:90-103). Se o código for corrigido sem trocar o texto, viram promessas falsas ao cliente.
- [ ] **P06-02** Chips indigo com lâmpada, cor que não existe no restante do app (MessageComposer.tsx:628-633).
- [ ] **P06-03** A barra de gravação tem fundo rose, ponto com animate-ping e animação de entrada (AudioRecorder.tsx).
- [ ] **P06-04** O tooltip 'Anexar qualquer arquivo ou documento' é prolixo (MessageComposer.tsx:608).

### A.5.7 Inbox: Importar e Exportar (modal) (F7)

- [ ] **P07-01** Ícone no cabeçalho, título 'Importação & Exportação' e subtítulo genérico 'Gerencie histórico e contatos do WhatsApp' (ImportExportModal.tsx:267-282).
- [ ] **P07-02** Cartões idênticos, e todos os botões têm ícone (linhas 341-422).
- [ ] **P07-03** Placeholder com 'João Silva' e 'Maria Santos' (linha 471).
- [ ] **P07-04** 'Arquivo JSON estruturado gerado com sucesso', 'sincronizados com sucesso!' e botão 'Importar Agora' (linhas 131, 487, 505).

### A.5.8 Inbox: Dados do contato (modal) (F7)

- [ ] **P08-01** Cada campo tem um ícone em caixa e um cartão (linhas 254-378).
- [ ] **P08-02** Selo 'Conta Comercial Verificada' mostrado para qualquer conta Business (linhas 224-225), afirmando uma verificação que o código não checa.
- [ ] **P08-03** Botões de fechar duplicados, o X e 'Fechar' no rodapé (linhas 195 e 386).

### A.5.9 Conexões (F7)

- [ ] **P09-01** Cabeçalho com 'Gerencie sessões, pareamento e disponibilidade dos canais conectados.' (ConnectionManager.tsx:205), repetindo a topbar.
- [ ] **P09-02** Estado vazio com quadrado verde de QR e botão 'Conectar WhatsApp Agora' (linhas 233-253).
- [ ] **P09-03** Grade de cartões idênticos com 'Status: Conectado', embora a lista quase só tenha conectados (linhas 257-390).
- [ ] **P09-04** Botões primários inconsistentes: branco ou preto na página e verde no modal (linhas 224, 249, 488). O raio varia entre lg, xl e 2xl.
- [ ] **P09-05** Jargão exposto: 'identificador técnico usado pela Evolution' e 'instância' (linhas 430-445).

### A.5.10 Conexões: diálogo de QR Code (F7)

- [ ] **P10-01** rounded-3xl com ícone em caixa, pílula e subtítulo (linhas 177-206), diferente dos drawers.
- [ ] **P10-02** 'WhatsApp Conectado com Sucesso!' em maiúsculas de título, com círculo verde (linhas 228-233).
- [ ] **P10-03** Caixa 'Como conectar' com três passos e verdes em hex (linhas 282-300).

### A.5.11 CRM (F7)

- [ ] **P11-01** Cada cartão tem clique, arraste, lixeira e um select de etapa sempre visível, o que é redundante e polui o quadro (ProductViews.tsx:~1255-1328).
- [ ] **P11-02** 'Sem valor' e as tags de origem se repetem nos cartões (ProductViews.tsx:~1296-1307).
- [ ] **P11-03** A paleta de 8 cores no estilo Tailwind inclui violeta e rosa (ProductViews.tsx:797-806).

### A.5.12 Clientes (F7)

- [ ] **P12-01** Cinco ações no cabeçalho mais barra de busca, segmentos e tags (ProductViews.tsx:~5175-5290).
- [ ] **P12-02** Todos os pontos de tag saem do mesmo cinza, então não diferenciam nada (linha 5661).
- [ ] **P12-03** O histórico usa quadrados emerald, amber e sky com ícones, em estilo diferente do sistema ux (linha ~5501).
- [ ] **P12-04** As linhas sem dados mostram '—' em várias colunas.

### A.5.13 Follow-up (F7)

- [ ] **P13-01** O subtítulo explica o óbvio com 'Conclua com um clique' (ProductViews.tsx:2035).
- [ ] **P13-02** O estado vazio lista exemplos genéricos, 'retornar clientes, enviar propostas ou confirmar pagamentos' (ProductViews.tsx:~2115).

### A.5.14 Calendário (F7)

- [ ] **P14-01** Há três botões de novo agendamento (cabeçalho, rodapé do dia e duplo clique).
- [ ] **P14-02** O painel de configuração é só leitura, com cara de ajuste que não se pode alterar.
- [ ] **P14-03** A descrição do drawer explica o que o sistema faz por baixo: 'Conflitos e capacidade… verificados ao salvar'.

### A.5.15 Agentes (F7)

- [ ] **P15-01** Três modelos com ícone e conversas roteirizadas, animadas em sequência. Uma delas promete lembrete: 'Te mando um lembrete no dia. Até lá!' (ProductViews.tsx:2396-2490, especialmente 2472).
- [ ] **P15-02** O robô promete três horários e 'consultor' em exemplos genéricos (linhas 2405-2470).
- [ ] **P15-03** O painel Status repete dados do cabeçalho da lista e das conexões.
- [ ] **P15-04** Quase todo campo, seção e painel tem frase de ajuda, e o editor ainda tem cinco abas âncora (ProductViews.tsx:~3600-3930).
- [ ] **P15-05** Os polegares usam emerald e red do Tailwind, fora dos tokens ux (ProductViews.tsx:~3515-3550).

### A.5.16 Base de conhecimento (F7)

- [ ] **P16-01** A função está espremida em uma coluna lateral, com texto de apoio 'Ficam só neste workspace' (ProductViews.tsx:~3362).
- [ ] **P16-02** Os três painéis laterais idênticos entram escalonados com animação.

### A.5.17 Toasts e confirmações (F7)

- [ ] **P17-01** 'A alteração foi salva.', 'Confira a informação e continue quando estiver pronto.' e 'Revise os dados antes de continuar.' são textos automáticos de preenchimento (ToastProvider.tsx, success, info e warning).
- [ ] **P17-02** Vários textos terminam em 'com sucesso' (ProductViews.tsx, chamadas de run(); ImportExportModal.tsx:113-150).

### A.5.18 Configurações: cabeçalho e navegação (F7)

- [ ] **P18-01** Título seguido de frase que só lista as seções ao lado (SettingsView.tsx:1100-1103).
- [ ] **P18-02** Toda seção repete o mesmo molde: ícone decorativo em quadrado, título e descrição (342-355 e styles.css:5348).
- [ ] **P18-03** Há descrições em jargão de implementação: 'registradas no backend', 'registrados no backend', 'persistido no backend' (1337, 1974, 2231).
- [ ] **P18-04** Toda ação mostra o aviso na página e também um toast com o mesmo texto (846-853, 1119).
- [ ] **P18-05** O toast de sucesso sempre acrescenta 'A alteração foi salva.', inclusive em 'Código enviado' e 'Exportação pronta' (components/ui/ToastProvider.tsx:79).
- [ ] **P18-06** Qualquer erro, inclusive de validação, vira toast com o título 'Conexão indisponível' (ToastProvider.tsx:68; SettingsView.tsx:796,853).
- [ ] **P18-07** Campos sem placeholder recebem 'Digite <rótulo>' automaticamente, como 'Digite telefone atual' (281).
- [ ] **P18-08** Tamanhos de 9, 10, 11 e 12px escritos na mão, com um remendo no CSS que força 9 e 10px para 12px (styles.css:5367).
- [ ] **P18-09** Cartões idênticos aninhados (rounded-xl com border-current/5). Os botões usam rounded-xl por cima de ux-btn, que tem outro raio (330, styles.css:3586, 5372).

### A.5.19 Configurações: Perfil (F7)

- [ ] **P19-01** A descrição explica a arquitetura: 'Dados do usuário autenticado... fluxos de confirmação separados' (1149).
- [ ] **P19-02** 'Trocar avatar' é um label de 10px e 36px de altura ao lado de um botão de 44px (1170).

### A.5.20 Configurações: Empresa (F7)

- [ ] **P20-01** Faixa com 'nome · owner' mostra o papel cru em inglês (1198-1202).
- [ ] **P20-02** 'Teal', 'white-label' e 'Acento visual' são jargão (1260-1290).
- [ ] **P20-03** Status de domínio diferente de 'pending' aparece cru (1293-1301).

### A.5.21 Configurações: Segurança (F7)

- [ ] **P21-01** Textos de apoio em jargão: 'Persistido em E.164 somente depois da confirmação' e 'sessões de aplicação' (1485, 1549).
- [ ] **P21-02** Três cartões iguais, cada um com título, microtexto e botão 'Alterar' (1341-1545).
- [ ] **P21-03** O botão apenas 'Encerrar' é vago (1562).

### A.5.22 Configurações: Dispositivos e modal de sessões (F7)

- [ ] **P22-01** Erro visível de plural: gera 'sessãoões' (532 e 1581-1587) e 'conexãoões' (2364).
- [ ] **P22-02** O modal tem eyebrow em maiúsculas 'Segurança da conta', título e explicação de agrupamento: 'Cada dispositivo aparece uma única vez...' (2315-2326).
- [ ] **P22-03** O rodapé repete a contagem e o botão 'Concluir' duplica o X (2362-2367).
- [ ] **P22-04** Nomes genéricos 'Conexão 1', 'Dispositivo 2' e 'Sessão neste dispositivo' repetidos (497-503, 560).

### A.5.23 Configurações: Workspace (membros e permissões) (F7)

- [ ] **P23-01** Cada membro vira um cartão com select, 'Salvar papel', 'Suspender', 'Permissões' e 'Remover' sempre expostos (1767-1865).
- [ ] **P23-02** Status do membro cru, como 'active' (1772).
- [ ] **P23-03** Rótulo 'billing' em inglês nas permissões, mesmo com billing desligado (SettingsView.tsx:87-88).
- [ ] **P23-04** A descrição lista as funções da própria seção (1632).

### A.5.24 Configurações: Privacidade (F7)

- [ ] **P24-01** Códigos crus: tipo e status da solicitação (2129-2132) e ações de auditoria como privacy.settings.update (2155).
- [ ] **P24-02** 'Redigir PII antes da IA' é anglicismo técnico (2103).
- [ ] **P24-03** 'Sem histórico anterior à conexão...' é texto fixo que não acompanha a opção escolhida (1983).

### A.5.25 Configurações: Plano e cobrança (F7)

- [ ] **P25-01** Quatro mini-indicadores com valores vazios ou 'não configurado' (2252-2276).
- [ ] **P25-02** Texto de bastidor ao usuário: 'Nenhum checkout ou cobrança fictícia foi criado. O backend já mantém o contrato de billing...' (2281-2286).

### A.5.26 ADM: acesso, acesso negado e cabeçalho (F7)

- [ ] **P26-01** Título duplicado: 'Inbox OS · Administração' com 'Control plane · superadmin' cru (admin.tsx:119-126) e, logo abaixo, 'Administração global' com 'Controle independente de workspaces · papel' (SystemAdminView.tsx:461-466).
- [ ] **P26-02** ShieldCheck decorativo no cabeçalho e na tela de bloqueio.
- [ ] **P26-03** As abas são uma fileira de botões contornados iguais às ações, e 'Atualizar dados' fica solto como mais um (468-537).
- [ ] **P26-04** Erro e sucesso aparecem no inline e no toast ao mesmo tempo (355-364, 520-531).
- [ ] **P26-05** Tema montado com ternários de hex e branco/preto com alfa, sem usar os tokens ux-* das Configurações (237-256).

### A.5.27 ADM: Visão geral (F7)

- [ ] **P27-01** Bug de rótulo: 'instances' e 'activeMembers' aparecem crus. O mapa tem users e messages24h, que a API não envia (admin/admin-presentation.ts:1-7; server/admin/admin-operations.server.ts:34-40).
- [ ] **P27-02** Grade de cinco cartões de número idênticos dentro de uma caixa 'Indicadores globais' (539-553).

### A.5.28 ADM: Usuários e ficha do cliente (F7)

- [ ] **P28-01** UUID exibido em cada linha (589-591).
- [ ] **P28-02** Título de caixa sem sentido, 'Suspensão, sessões e contas', e aviso redundante (562-566).
- [ ] **P28-03** Ficha em quatro cartões iguais com subtítulo 'Consulta administrativa somente leitura' (admin/AdminCustomerDetails.tsx).
- [ ] **P28-04** Status e papel crus na ficha (mesmo arquivo).

### A.5.29 ADM: Workspaces, membros e convites (F7)

- [ ] **P29-01** Mostra 'Workspace: <uuid>' em vez do nome (741).
- [ ] **P29-02** Texto cita o fornecedor: 'enviados pelo Resend' (799-802).
- [ ] **P29-03** Painéis abrem no fim da página, sem estado vazio.

### A.5.30 ADM: Serviços (integrações) (F7)

- [ ] **P30-01** Todos os cartões repetem 'Configuração protegida · segredo nunca exibido' (917-919).
- [ ] **P30-02** Explicação de criptografia e chave mestra (898-901) e outro texto longo sob os modelos liberados.
- [ ] **P30-03** Placeholders automáticos 'Digite chave de identificação' (Field, 177).
- [ ] **P30-04** Salvar, testar e rotacionar têm o mesmo peso visual.

### A.5.31 ADM: Newsletter (F7)

- [ ] **P31-01** Conteúdo inventado pré-preenchido: bloco 'Novidades' (340-343), 'Imagem da campanha' e 'Assistir ao vídeo' (1440-1455).
- [ ] **P31-02** Tipos de bloco em inglês e placeholders 'src', 'alt', 'href', 'thumbnail', 'label' (1255-1345).
- [ ] **P31-03** 'ID do segmento Resend' é um campo manual, apesar do select de segmentos acima (1239).
- [ ] **P31-04** UUID e status cru em cada campanha (1115-1118).
- [ ] **P31-05** Emoji ▶ e rótulo 'Sem enviar' na prévia, com ressalva repetida (admin/NewsletterPreview.tsx).
- [ ] **P31-06** Input de arquivo nativo sem estilo (1417-1422).

### A.5.32 ADM: Auditoria (F7)

- [ ] **P32-01** Linhas cruas 'action · target_type/uuid · role' (1565-1569).
- [ ] **P32-02** Cartões idênticos sem estado vazio.

### A.5.33 ADM: Administração (System Admins) (F7)

- [ ] **P33-01** Papel e status crus na lista (1487).
- [ ] **P33-02** Mistura 'System Admin' com 'Administradores globais' (1471-1492).
- [ ] **P33-03** Duas caixas com texto explicativo para uma lista e um formulário.

### A.5.34 Login e confirmação de dispositivo (F7)

- [ ] **P34-01** Fundo ASCII animado (features/auth/components/AsciiBackdrop.tsx), efeito decorativo típico.
- [ ] **P34-02** Subtítulo genérico 'Acesse seu workspace e continue seus atendimentos' (login.tsx:186).
- [ ] **P34-03** No passo do código há três botões de largura total empilhados.

### A.5.35 Cadastro (F7)

- [ ] **P35-01** Molde eyebrow 'Novo workspace', título e subtítulo 'Seus dados serão usados para preparar...' (register.tsx:224-226).
- [ ] **P35-02** Texto técnico 'Será armazenado como +55...' (por volta da linha 345).
- [ ] **P35-03** Placeholders inventados 'Ana' e 'Souza'.
- [ ] **P35-04** Medidor com '8+ caracteres' e nível soltos (AuthShell.tsx, PasswordMeter).

### A.5.36 Verificação de cadastro (F7)

- [ ] **P36-01** Texto copiado do login: eyebrow 'Verificação' e título 'Confirme este dispositivo', mas a tela confirma o cadastro (verify.tsx:83-85).
- [ ] **P36-02** 'Código enviado para o seu e-mail' repete a descrição.
- [ ] **P36-03** Placeholder de pontos, diferente do mesmo campo no login e na recuperação.
- [ ] **P36-04** 'Voltar' é um link com estilo inline.

### A.5.37 Recuperação de senha (F7)

- [ ] **P37-01** Eyebrow 'Recuperação' e subtítulo de política interna 'A resposta inicial nunca revela se uma conta existe', repetido nos três passos (forgot-password.tsx:138-146).
- [ ] **P37-02** Padrões de eyebrow, reenvio e erro diferentes entre login, verificação e recuperação.

### A.5.38 Modal de consentimento legal (F7)

- [ ] **P38-01** Placeholders expostos: badge 'Operador configurado' (153) e 'Políticas da o operador configurado' (289-290).
- [ ] **P38-02** Data fixa '15 de outubro de 2026' (222) contradiz '17 de outubro' dos textos (features/legal/legal-documents.ts).
- [ ] **P38-03** Eyebrow com escudo, badge, título e ícones nas abas.

### A.5.39 Páginas legais (5) (F7)

- [ ] **P39-01** Rodapé público 'Minuta técnica. Revisão jurídica recomendada antes do lançamento comercial' (LegalDocumentPage.tsx:23).
- [ ] **P39-02** Cookies, Pagamentos e Uso aceitável têm um parágrafo cada, num cartão grande quase vazio (legal-documents.ts, BODY).
- [ ] **P39-03** Textos de reserva 'Operador responsável' e 'e-mail de suporte configurado' aparecem sem as variáveis de ambiente (legal-documents.ts).
- [ ] **P39-04** Fundo escuro fixo (styles.css:1832-1847).

### A.5.40 Erro 404 da raiz (F7)

- [ ] **P40-01** Cartão centralizado com ícone em quadrado, eyebrow 'ERRO 404', título, parágrafo e dois botões (__root.tsx:23-61).
- [ ] **P40-02** 'Temporariamente indisponível' não se aplica a um 404.
- [ ] **P40-03** Sempre branco, ignora o tema escuro.

### A.5.41 Rota /404 (F7)

- [ ] **P41-01** Segunda versão do 404, com outro texto, ícone, padding, margens e botões diferentes do 404 da raiz (404.tsx:10-50).
- [ ] **P41-02** Sempre clara.

### A.5.42 Rota /500 (F7)

- [ ] **P42-01** Rótulo 'Erro 500 / 505' (500.tsx:15-17).
- [ ] **P42-02** Texto corporativo e garantia não verificada: 'Seus dados continuam seguros'.
- [ ] **P42-03** Mesmo molde de cartão com ícone.

### A.5.43 Erro de execução e erro SSR (F7)

- [ ] **P43-01** Eyebrow 'Status do Sistema' e 'retorne ao início seguro' (__root.tsx:70-110; lib/error-page.ts:117-119).
- [ ] **P43-02** Quatro implementações de tela de erro no total.
- [ ] **P43-03** Sempre brancas.

### A.5.44 Carregamento e 'Dispositivo desconectado' (F7)

- [ ] **P44-01** O modal é sempre escuro e usa a classe auth-primary (index.tsx, Disconnected).
- [ ] **P44-02** /admin usa o texto 'Validando acesso administrativo…', enquanto o app usa uma barra.

### A.5.45 Tela de autorização OAuth (sem rota) (F7)

- [ ] **P45-01** Visual shadcn padrão, diferente do AuthShell (ConsentView.tsx:132-193).
- [ ] **P45-02** Mostraria mensagens de erro técnicas cruas.

### A.5.46 E-mail: código de verificação (F7)

- [ ] **P46-01** Assunto, título e corpo genéricos, sem dizer qual ação (templates.ts:71-84).
- [ ] **P46-02** Cartão padrão com cabeçalho escuro, código em caixa cinza e 'Todos os direitos reservados' (56).
- [ ] **P46-03** Sem logo nem preheader.

### A.5.47 E-mail: alerta de segurança (F7)

- [ ] **P47-01** Mesmo molde e frase genérica 'encerre suas sessões e contate o suporte' (87-96), mesmo quando não há e-mail de suporte.

### A.5.48 E-mail: convite de workspace (F7)

- [ ] **P48-01** Não diz quem convidou nem quando expira (7 dias).
- [ ] **P48-02** Sem link em texto de reserva no HTML (98-109).

### A.5.49 E-mail: newsletter (F7)

- [ ] **P49-01** Sem cabeçalho, marca ou identificação do remetente no corpo. Visual diferente dos e-mails transacionais.

### A.6 Funções sem efeito ou enfeite (F8)

- [ ] **HON-01** **Navegação (rail, topbar e dock mobile):** Selo do logo no canto direito da topbar. É uma div com aparência de botão de perfil, sem clique (InboxShell.tsx, bloco 'Badge de Perfil do Operador').
- [ ] **HON-02** **Inbox: contas WhatsApp e lista de conversas:** Indicação visual de conta desconectada na barra. Código morto: a lista filtra só 'open' (AccountsSidebar.tsx:234), e o hook já descarta as desconectadas (useInstances.ts, fetchInstances).
- [ ] **HON-03** **Inbox: compositor:** Sugestões automáticas de resposta. Nunca aparecem: só são geradas quando existe replyingTo (linhas 85-108) e só são renderizadas quando não existe (linhas 617-620).
- [ ] **HON-04** **Follow-up:** Lembrete no prazo. O drawer diz 'Você será lembrado no prazo definido' (ProductViews.tsx:2269). Não achei envio de lembrete: routes/api/cron só tem evolution-recover e privacy-retention.
- [ ] **HON-05** **Agentes:** Polegar para cima ou para baixo nas respostas. Salvo só no localStorage, nunca vai ao servidor nem influencia o agente (ProductViews.tsx:2598 e 2699).
- [ ] **HON-06** **Configurações: Empresa:** Domínio personalizado. Só grava o valor com status 'pending' (profile.server.ts:227-229). Não encontrei verificação nem roteamento (SettingsView.tsx:1250-1256).
- [ ] **HON-07** **Configurações: Empresa:** Acento visual (Neutro, Teal, Índigo, Âmbar). accent_token é salvo, mas nenhuma tela o lê (SettingsView.tsx:1258-1277; profile.server.ts:225).
- [ ] **HON-08** **Configurações: Empresa:** Ativar identidade white-label. A flag é salva e só aparece no health check (SettingsView.tsx:1278-1291; routes/api/health.ts:92). A marca é aplicada com ou sem ela.
- [ ] **HON-09** **Configurações: Privacidade:** Importação de histórico (a partir da conexão ou não importar). import_history_policy só é gravado (server/privacy/privacy.server.ts:113-115). Não encontrei leitura em src/server fora disso (SettingsView.tsx:1995-2016).
- [ ] **HON-10** **Tela de autorização OAuth (sem rota):** Entrar e permitir ou recusar o acesso de um assistente. Código órfão: nenhuma rota ou componente importa ConsentView (ConsentView.tsx:38), então a tela é inacessível. FeaturePlaceholder.tsx também não é importado.

_Total: 244 itens._
