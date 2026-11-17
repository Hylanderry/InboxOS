---
name: inboxos-premium-uiux
description: "Padroniza UI/UX premium e responsiva do InboxOS, com glassmorphism discreto, tipografia legível, acessibilidade, alinhamento entre telas, testes visuais e prevenção de regressões. Usar ao alterar React, Tailwind, CSS, sidebar, inbox, auth, dashboard, CRM ou modais."
---
# InboxOS premium UI/UX — Skill de implementação e revisão

## Quando ativar
- Ao criar/corrigir componentes `src/components/ui`, `src/features`, `src/routes/auth` ou `src/styles.css`.
- Antes de entregar qualquer ajuste visual ao usuário. Confirmar que a instrução do usuário não é apenas backend.

## Fontes da verdade
1. O **código já implementado**, não um template genérico; primeiro ler `src/styles.css`, `InboxShell.tsx`, o componente alvo e a página consumidora.
2. `.agents/rules/inboxos-uiux-consistency.md` (limites invariantes).
3. `docs/FASE14_UIUX_AUDITORIA.md` (mapa de alterações + pendências).
4. `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md` (gates de release).

## Princípios positivos obrigatórios
1. **Não redesenhar arbitrariamente.** Continuar padrão existente Trax: fundo off-white em light, black-hole em dark, vidro sutil e cinza neutro. Cor funcional verde WhatsApp exclusivamente quando semântica pede.
2. **Tokens e hierarquia:** usar tokens de tema e variantes existentes; definir somente novos tokens semânticos com equivalentes claro/escuro. Conservar `H1`/`H2`/corpo legíveis, controles e componentes consistentes.
3. **Responsividade:** testar larguras 320, 360, 390, 768, 1024, 1440; mobile portrait/landscape e altura 540px. Verificar header, dock, listas, composer, ADM, auth, dialogs e overflow horizontal.
4. **Interações:** clique/touch/teclado; botão de ícone exige `aria-label`; campos exigem nome acessível; menus exigem Escape e estado expanded; formulário exige status, erro explícito e estados loading/disabled.
5. **Foco e toque:** área de toque aspiracional >=44px para controles primários (exceções justificadas); `:focus-visible` discernível nos dois temas; nenhum foco preso atrás de modal.
6. **Movimento:** transições curtas 140-280ms, transform/opacity quando possível, animação de layout com moderação; respeitar `prefers-reduced-motion` sem eliminar affordances.
7. **Alinhamento:** espaçamentos em escala 4/8/12/16/24; header e ferramentas usam eixos comuns; sidebar, tabs, cards, modais e formulários têm densidade consistente; não usar remendos globais com `!important` sem revisão explícita.
8. **Estados:** normal/hover/focus/active/disabled/error/loading/empty/success/dark/light, network offline e textos longos devem ser revisados.
9. **Integridade:** nunca alterar a assinatura de endpoints, objetos ou mensagens do backend para arrumar layout; manter filtros e IDs de workspace/instância.
10. **Documentar:** causa → mudança mínima → risco → teste → evidência (arquivo, screenshot, log).

## Restrições negativas
- NÃO trocar o framework, adicionar bibliotecas de UI, substituir Phosphor por Lucide em superfícies existentes, inventar API, retirar glassmorphism ou lançar neon intenso.
- NÃO usar fonte <12px em conteúdo funcional sem justificativa contextual; nunca depender apenas de cor para comunicar status.
- NÃO ocultar overflow por CSS em elementos de formulário ou modal a ponto de impedir scroll; não criar duplo scroll descontrolado; não quebrar safe-area do iPhone.
- NÃO usar `setTimeout`, reload de página ou estados locais duplicados como correção de sincronização quando o estado já existe nos hooks do produto.
- NÃO apagar componentes, mocks, logs ou testes para fazê-los passar. Não ajustar snapshots às cegas.
- NÃO reportar 'responsivo em todos os dispositivos' sem execução no browser.

## Procedimento por tela
1. Inventariar componentes/caminhos compartilhados e descobrir comportamento responsivo atual.
2. Escrever checklist de estados e da intenção. Separar problema **comprovado estaticamente** de suspeita visual.
3. Fazer patch mínimo; preferir classes locais/tokens em vez de overriding amplo.
4. Reexecutar `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build` quando deps disponíveis. Se um comando falhar por infraestrutura, classificar BLOCKED e manter saída exata.
5. No browser real com Deploy Preview ou `npm run dev`: capturar before/after nas seis larguras + landscape; tabulação, zoom 200%, escuro/claro, reduced motion; monitorar console, hydration warnings e network.
6. Corrigir falhas de qualquer regressão e repetir. Entregar tabela de teste PASS/FAIL/BLOCKED com caminhos e imagens.

## Critérios de aceite
- Não quebra navegação, envio, busca, filtros, mensagens, formulário, uploads ou atalhos.
- Sem truncamentos ilegíveis, controles inalcançáveis, vazamento horizontal, foco invisível ou botão 0x0.
- Sem novo texto ilegível no claro/escuro, sem contrastes desproporcionais, sem sobreposição com notch e teclado.
- Testes existentes + regressões novas verdes; browser/produção classificados pela evidência real.

## Atualização Fase 15 (obrigatória)
- Ler `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md` e `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md` como checkpoint mais novo que F14.
- Na UI de envio, testar **duplo clique**, resposta pendente + digitação de novo rascunho, erro de upload, erro de microfone e troca de conversa durante envio. Não implementar estados locais duplicados.
- Em modais de QR/importação/preview, manter `aria-modal`, trap Tab, Escape, retorno de foco, rótulo e estado; validar teclado e leitura de tela reais.
- Não confundir `npm test` com prova visual ou E2E. Precisamos de screenshots dos breakpoints e logs de console/rede após resolver G1.

## Fase 16 — bloqueios de regressão (obrigatórios)
1. **Operação assíncrona entre chats:** `src/features/inbox/hooks/chat-scoped-update.ts` é a lógica pura e testável. Não substituir pela atualização direta de `setMessages(prev => updater(prev))` para eventos antigos. Testar com chat A e B.
2. **Erro na timeline:** `MessageTimeline` exibe aviso `role="alert"` e botão de retry. Não trocar erro por estado vazio nem esconder mensagens em cache.
3. **Persistência de tema:** aguardar `themeLoaded` antes de gravar `localStorage`, inclusive sob React StrictMode; SSR inicial consistente.
4. **Menus e dialogs:** fechar por Escape e clique fora, sem fechar no `onMouseLeave`; primeiro controle deve ter foco, foco deve retornar ao gatilho no fechamento.
5. **Profile modal:** `role="dialog"`, `aria-labelledby`, Tab contido, Escape e restauração do foco. **Testes Node são contratos**, validar com navegador/screen reader.
6. **Avatar atualizado:** resetar fallback quando URL muda sem descaracterizar grupo/contato.
7. **Controles:** ações prioritárias ~44×44px; estados claro/escuro, contraste de quote, safe-area, 320/360/390/768/1024/1440, landscape e 200% zoom.
8. **Check obrigatório:** `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, Playwright/browser (quando disponíveis), com evidências por gate.
9. **Não afirmar que UI está pronta para produção** se build, browser e dados reais seguem BLOQUEADOS.
