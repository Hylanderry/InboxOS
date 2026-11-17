# InboxOS — Fase 14 | Auditoria UI/UX (código alterado)

**Base:** ZIP Fase 13 de 11/10/2026. **Responsável neste ciclo:** frontend/UX apenas. **Backend:** destinado a Antigravity/Codex conforme handoff F14. **Release:** NO-GO.

## Problemas confirmados estaticamente e corrigidos

| Ref | Causa na Fase 13 | Mudança na Fase 14 | O que pode quebrar | Validação realizada | Limite |
|---|---|---|---|---|---|
| UI-01 | Busca global tinha `globalSearch` local, mas lista usava `filters.searchQuery`; editar em um lugar não atualizava o outro | Cabeçalho agora usa diretamente `filters.searchQuery` | Pesquisa persistente pode aparecer no cabeçalho, intencional | Teste de contrato F14/UI01 PASS | Fluxo navegador pendente |
| UI-02 | Se `onSendMessage` lançasse exceção, `isSending` ficava `true` para sempre | Envio envolto por try/catch/finally, com notificação e liberação do loading | Toast duplicado se hook também notificar erro; revisar no E2E | F14/UI02 PASS | Erro real de rede pendente |
| UI-03 | Enter confirmava envio enquanto usuário compunha caractere via IME | Ignorar Enter quando `nativeEvent.isComposing` | Método de envio por Enter continua; Shift+Enter mantém quebra | F14/UI03 PASS | IME real no browser pendente |
| UI-04 | Menu de anexos sem fechar via Escape e botões sem estado acessível | Escape, aria-expanded, aria-label e identificação do grupo de anexos | Escape só age com menu aberto | F14/UI04 PASS | Foco keyboard real pendente |
| UI-05 | Busca e filtros não anunciavam nome/estado suficiente a tecnologias assistivas | Labels e aria-pressed dos filtros; limpar busca acessível | Sem alteração no algoritmo dos filtros | F14/UI05 PASS | Leitor de tela pendente |
| UI-06 | Ícones de ChatHeader dependiam de title/visual, e não expunham estado | aria-label, aria-pressed/expanded, classe para alvo tátil | Cabeçalho pode ficar mais denso em 320px; validar | F14/UI06 PASS | Capturas mobile pendentes |
| UI-07 | Dock/ícones mobile tinham alvos de 36px e texto efetivo abaixo de 10px; formulários e status abaixo de 12px | Overrides escopados para touch, leitura, focus, safe-area e reduced motion | Mais altura e necessidade de rolagem em telas curtas; inspecionar iOS landscape | F14/UI07 PASS | QA visual pendente |
| UI-08 | Padrão visual existia apenas parcialmente em CSS, sem instrução reutilizável do agente | Skill workspace, rule always_on e AGENTS.md vinculados | Se agente ignorar arquivos ou tiver regra global conflitante, verificar em seu ambiente | F14/UI08 PASS | Ativação Antigravity externo pendente |
| UI-09 | Feedback no login OTP/erro não possuía papéis de anúncio | `role=status`, `role=alert`, label e pattern do OTP | Se a validação nativa impedir submissão inválida, comportamento desejado | Parse/auditoria PASS | Screenreader/teste real pendente |

## Arquivos alterados na F14 (UI e governança)
- `src/features/inbox/components/InboxShell.tsx`
- `src/features/inbox/components/MessageComposer.tsx`
- `src/features/inbox/components/ConversationList.tsx`
- `src/features/inbox/components/ChatHeader.tsx`
- `src/routes/auth/login.tsx`
- `src/styles.css`
- `package.json` (script de testes inclui F14)
- `tests/uiux-phase14.test.ts`
- `.agents/rules/inboxos-uiux-consistency.md`, `.agents/skills/inboxos-premium-uiux/SKILL.md`, `.agents/skills/inboxos-backend-release/SKILL.md`, `AGENTS.md`.

## Trabalho UI que continua obrigatório (não declarar concluído)
- [ ] QA visual com código compilado e screenshots em **320, 360, 390, 768, 1024, 1440**; testar portrait e landscape do iPhone, tablet e zoom 200%.
- [ ] Validar sidebar recolhida/aberta, inbox sem conversa, carregando, erro, pesquisa, filtros, nome de grupo longo e sem avatar.
- [ ] Validar menu de anexos, fechamento por Escape, navegação Tab/Shift+Tab e foco restaurado após fechar dialogs.
- [ ] Revisar layout de ChatHeader no 320px e 360px com nomes longos (possível sobreposição dos botões).
- [ ] Validar os três níveis de glassmorphism e contraste em light/dark sob transparência reduzida.
- [ ] Inspecionar `SettingsView`, `SystemAdminView`, `ProductViews`, `ImportExportModal`, `ConnectionManager`, `QrCodeDialog` via browser: não houve auditoria visual real nestas superfícies.
- [ ] Testar autenticação com teclado aberto, OTP inválido, spinner e mensagens de erro por screen reader.
- [ ] Monitorar console por hydration mismatch e warnings de acessibilidade; monitorar network para garantir que filtros não gerem requests redundantes.
- [ ] Conferir resposta de erro de rede do envio (toast apenas uma vez; texto preservado; botão liberado) e enviar via IME real.
- [ ] Executar auditoria automatizada de contraste e WCAG 2.2 AA no browser; corrigir achados individuais, não aplicar resets globais de CSS.

## Evidências atuais e limites
- `npm test`: **210/210 PASS**, sendo **8 testes F14 adicionais** de contrato estático; isso NÃO equivale a E2E visual.
- `npm run audit:release`: **269 arquivos TS/TSX/MTS parseados**, zero erros de parsing/import local, 83 rotas mapeadas; **FAIL** 6 itens do lockfile.
- `npm ci --offline`: **ENOTCACHED** no plugin Netlify.
- `npm run lint`: **BLOCKED** (`eslint: not found`).
- `tsc --noEmit`: **BLOCKED** (`Cannot find type definition file for 'vite/client'`).
- `npm run build`: **BLOCKED** (`vite: not found`).
- Nenhum screenshot da aplicação em execução, nenhum Deploy Preview, nenhuma modificação backend/Supabase/produção neste ciclo.
