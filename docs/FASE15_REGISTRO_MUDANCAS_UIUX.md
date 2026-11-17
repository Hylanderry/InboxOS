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
