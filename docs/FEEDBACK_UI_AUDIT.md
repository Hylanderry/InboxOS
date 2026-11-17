# Auditoria de feedback visual — InboxOS

Data: 17/10/2026

## Atualizacao incremental - 21/10/2026

| ID | Problema | Causa evidenciada | Correcao | Impacto | Evidencia |
| --- | --- | --- | --- | --- | --- |
| UI-21-01 | Iconografia irregular em submenus, caixas e controles compartilhados | Os primitivos de UI ainda importavam um segundo conjunto de icones | Migrados para `@phosphor-icons/react`; `lucide-react` removido das dependencias diretas | Somente apresentacao dos primitivos, sem mudar payloads, rotas ou autorizacao | TypeScript, lint e teste de regressao `premium-selects` PASS |
| UI-21-02 | Evidencia mobile podia capturar o frame de saida de um seletor como se ele continuasse aberto | A captura ocorria durante a animacao curta de fechamento do Radix | Auditoria agora confirma `aria-expanded=false` apos selecao e aguarda 240 ms antes da imagem | Apenas o runner de QA; comportamento do componente preservado | Playwright de Configuracoes em 320x640 PASS |
| UI-21-03 | Cobertura do ADM verificava apenas a primeira troca de aba | As demais areas administrativas nao eram percorridas pelo runner | Playwright percorre as sete areas, valida foco por teclado e o painel associado | Detecta regressao de tab/painel em Administracao global | ADM em 1440x900 e 320x640 PASS |

Escopo nao coberto por esta rodada: Evolution real, midia remota, recibos do WhatsApp e APIs externas continuam dependentes de staging isolado. Nenhum provedor externo, banco remoto ou mensagem foi alterado.

## Padrão aplicado

- Toasts usam o mesmo tema do toggle (`light`/`dark`), ficam alinhados ao cabeçalho no canto superior direito e respeitam safe-area no mobile.
- A pilha mostra no máximo quatro avisos, sem expansão automática e sem duplicação dos erros de rede recorrentes.
- Cópias são curtas, diretas e acionáveis. Detalhes técnicos como `HTTP 500`, `fetch failed` e `TypeError` não são exibidos ao usuário.
- Alertas inline usam `inbox-feedback` com ícone Phosphor, título, descrição e estados semânticos neutros: erro, aviso e sucesso.
- A paleta funcional permanece discreta: rosa/vermelho para erro, âmbar para atenção, verde somente para sucesso/conexão; os tokens têm equivalentes claro/escuro.

## Inventário auditado

### Toasts globais

Arquivo: `src/components/ui/ToastProvider.tsx`

| Estado                 | Título padrão                          | Ação                        |
| ---------------------- | -------------------------------------- | --------------------------- |
| Instância desconectada | Conexão desconectada                   | Reconectar                  |
| Envio recusado         | Mensagem não enviada                   | Tentar de novo              |
| Arquivo excedente      | Arquivo acima do limite                | Selecionar outro arquivo    |
| QR expirado            | Código expirado                        | Gerar novo código           |
| Falha de rede          | Conexão indisponível                   | Repetir pela tela de origem |
| Sucesso                | Texto da ação, sem pontuação duplicada | —                           |
| Erro                   | Texto da ação + orientação curta       | —                           |
| Informação             | Texto informativo + próximo passo      | —                           |
| Aviso                  | Texto de atenção + revisão             | —                           |

Chamadores revisados: Inbox, lista de conversas, contas, conexões, composer de texto/mídia/áudio,
importação/exportação, CRM, follow-up, calendário, agentes, configurações e administração global.

### Alertas inline

| Superfície                                               | Arquivo                                                                              | Estado                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Histórico da conversa                                    | `MessageTimeline.tsx`                                                                | Erro de atualização + retry                                           |
| Produtos (CRM, follow-up, agentes, calendário, clientes) | `ProductViews.tsx`                                                                   | Erro compartilhado                                                    |
| Agentes sem provedor configurado                         | `ProductViews.tsx`                                                                   | Aviso `Respostas automáticas desativadas` + estado `Desativado`       |
| Configurações                                            | `SettingsView.tsx`                                                                   | Sucesso/erro com ícone e tema                                         |
| Administração global                                     | `SystemAdminView.tsx`                                                                | Sucesso/erro com ícone e tema                                         |
| Autenticação                                             | `auth/login.tsx`, `auth/register.tsx`, `auth/verify.tsx`, `auth/forgot-password.tsx` | Mensagens inline existentes, mantidas para não alterar o fluxo de OTP |
| Consentimento                                            | `features/auth/ConsentView.tsx`                                                      | Erro de autorização inline                                            |

### Estados de espera/carregamento

- Workspace: `routes/index.tsx` e `routes/admin.tsx` exibem estado de validação/carregamento sem toast.
- Conversas: skeleton, `Carregando conversas` e `Carregar mais conversas` permanecem locais à lista.
- Mensagens: `Carregando conversa` e `Carregar mensagens anteriores` permanecem locais à timeline.
- QR Code: `Gerando QR Code de pareamento` e `Aguardando inicialização` ficam no próprio diálogo.
- Envio: `Enviando mensagem` fica em `aria-live` e não cria toast duplicado.
- Auth/OTP: botões `Enviando…`, `Reenviando…` e cooldown permanecem junto do formulário.

### Diálogos e popups

- Conexões/QR: `ConnectionManager.tsx`, `QrCodeDialog.tsx` — foco, Escape e retry preservados.
- Perfil comercial: `BusinessProfileModal.tsx` — foco e erro de carregamento preservados.
- Importar/exportar: `ImportExportModal.tsx` — status de arquivo e resultado anunciados.
- Pré-visualização de mídia: `MediaPreviewModal.tsx` — modal de mídia sem alteração de contrato.
- Consentimento legal: `LegalConsentDialog.tsx` — rolagem obrigatória e aceite mantidos.
- Perfil de mensagem: `MessageBubble.tsx` — pré-visualização e ações mantidas.
- Menus de conversa e conta: fechamento por Escape/clique externo preservado.

### Confirmações destrutivas

As confirmações nativas ainda existem e foram inventariadas para futura migração ao componente visual
do sistema: remover conexão, excluir lead, excluir follow-up, excluir agente, suspender workspace/usuário,
revogar convite, enviar newsletter e alterar privilégio global. Elas não foram trocadas nesta rodada para
evitar alterar a autorização de ações administrativas.

## Critérios de verificação

- Claro/escuro: tokens e contraste revisados.
- Desktop: toast alinhado abaixo do cabeçalho/toggle, sem cobrir a navegação.
- Mobile: largura limitada à viewport, safe-area e alvos de ação preservados.
- Acessibilidade: `role="alert"` para erro e `role="status"` para sucesso/aviso; ações continuam focáveis.
- Rede: retry continua na origem; toasts não afirmam reconexão automática sem que ela exista.

## Pendências reais

1. Substituir `window.confirm` administrativo por `AlertDialog` temático, mantendo exatamente as mesmas
   permissões e payloads.
2. Executar QA visual Playwright nos seis breakpoints e nos dois temas após o próximo deploy.
3. Revisar mensagens provenientes de novos módulos quando forem adicionados; este inventário cobre as
   superfícies existentes em 17/10/2026.
