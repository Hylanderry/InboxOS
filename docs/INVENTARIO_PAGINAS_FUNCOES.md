# InboxOS — Inventário de páginas e funções

> Levantado por leitura do código da branch `chore/cleanup-and-line-endings`. Nada foi executado:
> "Funciona" significa ligado a um backend real no código, não testado no navegador.

49 telas · 112 funções funcionam · 71 em parte · 10 não funcionam ou são enfeite.

## Índice

1. Navegação (rail, topbar e dock mobile)
2. Dashboard
3. Inbox: contas WhatsApp e lista de conversas
4. Inbox: cabeçalho do chat e menus
5. Inbox: timeline e balões
6. Inbox: compositor
7. Inbox: Importar e Exportar (modal)
8. Inbox: Dados do contato (modal)
9. Conexões
10. Conexões: diálogo de QR Code
11. CRM
12. Clientes
13. Follow-up
14. Calendário
15. Agentes
16. Base de conhecimento
17. Toasts e confirmações
18. Configurações: cabeçalho e navegação
19. Configurações: Perfil
20. Configurações: Empresa
21. Configurações: Segurança
22. Configurações: Dispositivos e modal de sessões
23. Configurações: Workspace (membros e permissões)
24. Configurações: Privacidade
25. Configurações: Plano e cobrança
26. ADM: acesso, acesso negado e cabeçalho
27. ADM: Visão geral
28. ADM: Usuários e ficha do cliente
29. ADM: Workspaces, membros e convites
30. ADM: Serviços (integrações)
31. ADM: Newsletter
32. ADM: Auditoria
33. ADM: Administração (System Admins)
34. Login e confirmação de dispositivo
35. Cadastro
36. Verificação de cadastro
37. Recuperação de senha
38. Modal de consentimento legal
39. Páginas legais (5)
40. Erro 404 da raiz
41. Rota /404
42. Rota /500
43. Erro de execução e erro SSR
44. Carregamento e 'Dispositivo desconectado'
45. Tela de autorização OAuth (sem rota)
46. E-mail: código de verificação
47. E-mail: alerta de segurança
48. E-mail: convite de workspace
49. E-mail: newsletter

## Problemas visuais do aplicativo (geral)

- São três ou quatro sistemas de tokens convivendo: o shadcn em oklch azul-ardósia (src/styles.css:64-137), o --trax-* de vidro (styles.css:362-372), o --inboxos-* com raio de 16/12px (styles.css:539-545) e o --ux-* das telas de produto (styles.css:3411+). Há ainda --motion-* e --inboxos-motion-* duplicados (styles.css:1627). O arquivo tem 5.507 linhas e 61 !important.
- O app tem duas linguagens visuais. Dashboard, CRM, Clientes, Follow-up, Calendário e Agentes usam o sistema ux-*. Inbox, Conexões, rail, modais e QR usam Tailwind com hex solto (InboxShell.tsx:412; ConversationList.tsx:65; ImportExportModal.tsx:257; ConnectionManager.tsx:197-257). Ao trocar de tela, parece outro produto.
- Há dezenas de pretos e cinzas quase iguais: #080809, #0a0a0b, #0b0b0c, #0e0e13, #111115, #111216, #121215, #14141a, #16161e, #181820, #181822, #1a1a22, #22222e, #2a3942 e outros. Parte é cinza azulado e parte é neutra.
- O verde do WhatsApp aparece como #00a884 fixo (52 ocorrências nos componentes), como var(--whatsapp) com color-mix e como #25D366 no gráfico (ProductViews.tsx:654). Somam-se âmbar (40 usos), rose, red, indigo, emerald e sky sem regra semântica. Rose e red fazem o mesmo papel de erro.
- Raios sem escala nos componentes: rounded-xl 118, rounded-lg 71, rounded-full 47, rounded 29 e rounded-md 16, além de 2xl e 3xl no QR (QrCodeDialog.tsx:177). O CSS tem cerca de 30 valores de border-radius, de 2px a 26px.
- Há cerca de 20 tamanhos de texto (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14px e outros) e muito texto de 9 a 10px. O CSS ainda tem tamanhos de 0.5rem a 0.68rem.
- Inter e Plus Jakarta Sans são carregadas do Google Fonts (routes/__root.tsx:124). A pilha --font-sans começa em Inter, o visual padrão de template (styles.css:147-150).
- O cabeçalho se repete três vezes: eyebrow 'HOME', 'GESTÃO' ou 'AUTOMAÇÕES' com título na topbar (InboxShell.tsx:529; navigation.ts), o mesmo título em H1 logo abaixo e um subtítulo explicativo (ProductViews.tsx:497, 2034, 2999, 4354, 5180). No mobile, o eyebrow volta (InboxShell.tsx:626). O grupo 'HOME' com CRM e Clientes e o grupo 'GESTÃO' com Inbox não seguem lógica clara (navigation.ts).
- Há animação em tudo: revelação escalonada de painéis e linhas ao montar (styles.css:4440-4480), animate-smooth-in nas telas e vazios, scale no :active de todo botão, animate-ping, bounce e pulse. São cerca de 51 usos de animate- nos componentes. O 'transition: all' aparece em styles.css:2017-2355.
- O vidro e o blur são decorativos: 14 usos de backdrop-blur nos componentes, além dos tokens de vidro. Há !important em .dark .app-topbar e .conversation-panel, que sobrescreve as cores definidas no JSX (styles.css:750-756).
- A rolagem é forçada como suave em body, main, timeline e outras áreas (styles.css:~179-197), com scrollbar customizada global (styles.css:222-258). overflow-wrap:anywhere em todo p, h, label e strong pode quebrar palavras no meio (styles.css, bloco .inboxos-page e .inbox-app, logo após 545).
- Toasts: todo sucesso sem descrição ganha 'A alteração foi salva.' (ToastProvider.tsx, método success), inclusive em ações que não salvam nada. Todo erro enviado por networkError recebe o título 'Conexão indisponível' (ToastProvider.tsx, networkError), mesmo em 'Este arquivo está vazio' (MessageComposer.tsx:379) ou JSON inválido na importação (ImportExportModal.tsx:240).
- Os erros aparecem em dobro: a ErrorBox fixa na página ('Não foi possível concluir') e o toast com a mesma mensagem (ProductViews.tsx:260-270 com 367, 885, 1949, 2672, 4268, 5025). O Toaster ainda usa expand e mostra até 4 empilhados (components/ui/sonner.tsx).
- O estado vazio segue sempre a mesma fórmula, com ícone gigante apagado ou quadrado de ícone, título e frase de ajuda (InboxShell.tsx:778-787 e 880-897; ConversationList.tsx:311-322; MessageTimeline.tsx:229-236; ConnectionManager.tsx:233-253).
- Navegação: o menu mobile mostra 'Agentes' para o papel 'agent', que o rail esconde (AccountRail.tsx:134 e MobileDock.tsx:24-30). Os nomes mudam entre desktop e mobile (Dashboard/Início, Calendário/Agenda, Configurações/Ajustes). O rail usa sempre o logo da plataforma, mesmo com logo do workspace na topbar (AccountRail.tsx:112).

## Problemas gerais de ADM, acesso e e-mails

- Prioridade 1, risco: 'Solicitar exclusão' do workspace sem confirmação nem cancelamento (SettingsView.tsx:2113). Remover membro (1852), encerrar outras sessões (1552), revogar dispositivo e rotacionar segredo também não confirmam. O ConfirmDialog já existe e é usado só em partes do ADM.
- Prioridade 2, controles sem efeito: acento visual, white-label, domínio personalizado, importação de histórico e a tela OAuth órfã. Convite para conta existente não tem tela de aceite.
- Prioridade 3, bugs visíveis: 'sessãoões' e 'conexãoões' (SettingsView.tsx:532, 1582, 2364); métricas 'instances' e 'activeMembers' cruas no ADM; recuperação de senha avança mesmo quando a API falha.
- Feedback duplicado e errado: aviso inline mais toast em Configurações e ADM; todo sucesso ganha 'A alteração foi salva.'; todo erro vira 'Conexão indisponível' (components/ui/ToastProvider.tsx:68-80).
- Texto de desenvolvedor na interface: backend, E.164, PII, billing, control plane, Resend, 'cobrança fictícia', 'Minuta técnica', 'Operador configurado' e 'A resposta inicial nunca revela...'.
- Valores crus em inglês ou UUIDs: papéis, status, tipos de solicitação, ações de auditoria, tipos de bloco e IDs de usuário, workspace e campanha.
- Molde repetido de eyebrow, título e subtítulo, ou ícone em quadrado, título e parágrafo: Configurações, autenticação, modais, 404/500 e ADM. Quase todo título ganha uma frase explicativa redundante.
- Excesso de caixas iguais, muitas aninhadas, com todas as ações no mesmo peso. No ADM, quase todo botão usa o mesmo contorno e falta hierarquia entre primário e destrutivo.
- Pelo menos quatro sistemas visuais: ux-* nas Configurações, ternários próprios no ADM, auth-* e legal-* na autenticação, Tailwind zinc fixo nos erros; a tela OAuth órfã usa shadcn.
- Escalas inconsistentes: textos de 9 a 14px, botões de 36, 40 e 44px, e raios de 8, 10, 12, 16, 24px e rounded-3xl.
- Temas inconsistentes: páginas de erro sempre claras, páginas legais e modal de desconexão sempre escuros.
- Marca inconsistente: 'Inbox OS' (lib/platform-brand.ts) contra 'InboxOS' (templates.ts, error-page.ts, legal-documents.ts). A meta descrição usa 'Central premium de atendimento e operações' (__root.tsx).
- Estados faltando: listas do ADM sem estado vazio. Nas Configurações, falhas parciais ao carregar empresa, membros ou privacidade são engolidas por allSettled e aparecem como vazio (SettingsView.tsx:714-766).
- Método: inventário feito só por leitura de código, sem executar app, rede ou banco. 'ok' significa ligado a um endpoint ou handler real, não testado em funcionamento. Nem todos os handlers do servidor foram lidos por inteiro. Linhas sem prefixo nas entradas de Configurações e ADM referem-se a SettingsView.tsx e SystemAdminView.tsx; caminhos relativos a src/.

---

## 1. Navegação (rail, topbar e dock mobile)

`/?view=… (InboxShell.tsx, AccountRail.tsx, MobileDock.tsx)`

### Funções

**Funciona**

- Rail: abrir Dashboard, CRM, Clientes, Inbox (com badge de não lidas), Follow-up, Calendário, Conexões, Agentes e Configurações — O badge soma só as conversas carregadas e filtradas pelo hook.
- ADM global (só para administrador do sistema) e Sair
- Mostrar ou ocultar o rail; alternar tema claro e escuro — O tema é guardado no navegador. A ocultação do rail não persiste.

**Em parte**

- Dock mobile: Início, CRM, Inbox, Conexões e menu Mais (Clientes, Follow-up, Agenda, Agentes, Ajustes, Administração global) — Não filtra por papel (MobileDock.tsx:24-30).
- Topbar mobile: pílula com o número de conexões e botão de perfil que abre Configurações — Troca a tela sem atualizar a URL (InboxShell.tsx:634 e 652). O atalho '+' das contas faz o mesmo (linha 484).

**Não funciona / enfeite**

- Selo do logo no canto direito da topbar — É uma div com aparência de botão de perfil, sem clique (InboxShell.tsx, bloco 'Badge de Perfil do Operador').

### Cara de IA

- Eyebrow em caixa alta de 9px com tracking sobre o título, repetido pelo H1 da página (InboxShell.tsx:524-545).
- Rótulos de grupo genéricos HOME, GESTÃO e AUTOMAÇÕES (navigation.ts, appNavigationGroups).
- Os metadados 'description' e 'implemented' de cada view têm tom de gerador, como 'persistente e isolado por workspace' (navigation.ts).

---

## 2. Dashboard

`/?view=dashboard (ProductViews.tsx, DashboardView)`

### Funções

**Funciona**

- Escolher o período (7, 10, 30 ou 90 dias), atualizar e ver o horário da atualização
- KPIs de mensagens no período, conversas ativas, não lidas e leads
- Painéis laterais Atendimento e Vendas e automação — Somente leitura.

**Em parte**

- KPI 'Pipeline aberto / em negociação' — Soma todos os leads, inclusive ganhos e perdidos (workspace-product.server.ts:127 e 170). O CRM soma só as etapas abertas, então os dois números divergem.
- Tempo médio de resposta — Usa até 5.000 mensagens em ordem crescente, ou seja, as mais antigas do período (workspace-product.server.ts:151). Qualquer remetente diferente de 'agent' conta como entrada (linha 218).
- Gráfico de volume de mensagens por dia — A consulta não pagina (workspace-product.server.ts:140). Risco, não testado: o limite padrão de linhas do Supabase pode cortar justamente os dias recentes.
- 'Precisa de atenção', com atalhos para Inbox, Follow-up, Conexões e Agentes — São regras fixas no cliente, a partir da linha ~400. O aviso de número desconectado leva a uma tela que oculta os desconectados.

### Cara de IA

- Cinco KPIs idênticos com rótulo, número e legenda (ProductViews.tsx:~548-590).
- Os painéis laterais repetem Conversas ativas, Não lidas, Mensagens, Leads e Follow-ups já mostrados nos KPIs (ProductViews.tsx:~700-765).
- Textos prontos de 'insight', como 'Considere redistribuir' e 'Um agente pode responder dúvidas comuns fora do horário', este sem base em horário (ProductViews.tsx:443 e 452+). O percentual compara 3 dias com os 4 anteriores, mas o texto diz 'semana anterior'.
- 'Como está a operação do workspace agora.' e 'Tudo em dia' são frases de preenchimento (ProductViews.tsx:497 e 677).
- A grade do gráfico é branca fixa, invisível no tema claro. O tooltip é sempre escuro e usa outro verde (ProductViews.tsx:611, 641, 654).
- O esqueleto de carregamento tem layout diferente do conteúdo final.

---

## 3. Inbox: contas WhatsApp e lista de conversas

`/?view=inbox (AccountsSidebar.tsx, ConversationList.tsx, ConversationRow.tsx)`

### Funções

**Funciona**

- Barra de contas que expande no hover: selecionar todas ou uma conta, fixar a barra, sincronizar mensagens e abrir Conexões pelo '+'
- Selecionar conversa, marcar como lida e carregar mais
- Sincronizar fotos de perfil — Também dispara a sincronização com a Evolution.
- Abrir Importar e Exportar
- Linha da conversa: foto, fixada, instância, horário, prévia, digitando ou gravando, não lidas e SLA de atendimento humano

**Em parte**

- Buscar conversas no campo da topbar, no campo da lista ou no overlay mobile — Filtra no cliente só o que foi carregado (lotes de até 1.000), por nome, telefone e última mensagem. Não busca no histórico (useConversations.ts:~314).
- Filtros Todas, Não Lidas, Grupos, Leads, Pessoais e Arquivadas — Também atuam só sobre o que foi carregado.
- Overlay de busca no mobile e tablet — Ao escolher um resultado, não chama markChatRead na hora. Dentro dele aparece a ConversationList inteira, com um segundo campo de busca e filtros (InboxShell.tsx:~830-880).

**Não funciona / enfeite**

- Indicação visual de conta desconectada na barra — Código morto: a lista filtra só 'open' (AccountsSidebar.tsx:234), e o hook já descarta as desconectadas (useInstances.ts, fetchInstances).

### Cara de IA

- Dois campos de busca visíveis ao mesmo tempo no desktop, com placeholders diferentes (InboxShell.tsx:~556; ConversationList.tsx:92).
- Seis chips em pílula com rolagem horizontal e o mesmo bloco de classes copiado seis vezes (ConversationList.tsx:147-287). O chip ativo perde a borda.
- O título 'Conversas' com pílula de contagem se soma ao título 'Inbox · N conexões ativas' da topbar.
- Cada linha tem selo verde com o nome da instância, borda verde na seleção e avatar verde de fallback (ConversationRow.tsx:69, 100, 127-137).
- O ícone de upload representa importar e exportar (ConversationList.tsx:142).
- A barra de contas tem seus próprios cinzas azulados em hex e o rótulo 'WA' quando recolhida (AccountsSidebar.tsx:60-139).
- No estado vazio do chat, o ícone de 56px e o texto 'Selecione uma conversa na lista ao lado ou selecione outra conta…' são redundantes (InboxShell.tsx:778-787).

---

## 4. Inbox: cabeçalho do chat e menus

`ChatHeader.tsx`

### Funções

**Funciona**

- Voltar (mobile) e abrir os dados do contato pelo avatar, pelo botão 'i' ou pelo menu
- Registrar cliente no CRM
- Pausar ou retomar a IA pelo botão ou pelo menu
- Fixar pelo botão ou pelo menu; arquivar pelo botão
- Menu: Exportar conversa — Abre o modal geral.
- Menu: Assumir ou Encerrar atendimento humano — Só aparece com handoff ativo. A ação 'cancel' existe no tipo, mas não tem botão.
- Selos Arquivada, Humano e Apenas Admins; status digitando ou gravando

### Cara de IA

- Ações duplicadas: dados do contato tem três entradas, e fixar e IA têm duas cada (ChatHeader.tsx:173, 303, 327, 341, 410-470).
- Estilos misturados: pílula 'IA ativa' com borda verde, ícone verde de CRM, fixar âmbar e hovers em três paletas (ChatHeader.tsx:291-390).
- Há um menu feito à mão enquanto o CRM usa o DropdownMenu do Radix.

---

## 5. Inbox: timeline e balões

`MessageTimeline.tsx, MessageBubble.tsx, AudioPlayer.tsx, MediaPreviewModal.tsx`

### Funções

**Funciona**

- Carregar anteriores, rolar para o fim, tentar de novo, separadores de data e aviso de sem conexão
- Ver texto com 'Ler mais', citação e status de envio ou entrega
- Responder mensagem ou figurinha
- Ampliar imagem, vídeo, GIF, figurinha e documento; baixar documento; ouvir áudio
- Indicador de digitando ou gravando

**Em parte**

- Reagir ou remover reação (botão ou toque longo) e ver quem reagiu — O envio funciona, mas a exibição troca os emojis por ícones. Emoji não mapeado vira estrela 'Sparkle' (MessageBubble.tsx:156-181), então a reação real se perde.
- Reenviar mensagem que falhou — O balão mostra só 'Falhou' (MessageBubble.tsx:1043). O reenvio existe apenas no toast, que some (useMessages.ts:~490).

### Cara de IA

- Reações como ícones Phosphor coloridos no lugar de emoji, com o comentário '0 Emojis' e o fallback Sparkle, símbolo típico de IA (MessageBubble.tsx:181 e 1053).
- Botão flutuante com a frase longa 'Ir para as mensagens mais recentes' (MessageTimeline.tsx:354).
- O separador de data em caixa alta usa a paleta azulada do WhatsApp (#182229, #8696a0), fora do restante do app (MessageTimeline.tsx:~258).
- 'Documento • Clique para abrir' (MessageBubble.tsx:949) e 'Envie uma mensagem abaixo para iniciar o contato' são textos de ajuda redundantes.
- O aviso de offline promete 'reconectando automaticamente' com base apenas no estado de rede do navegador (MessageTimeline.tsx:179).

---

## 6. Inbox: compositor

`MessageComposer.tsx, AudioRecorder.tsx`

### Funções

**Funciona**

- Digitar (Enter envia, Shift+Enter quebra linha) e avisar presença
- Gravar, descartar e enviar áudio
- Citar e cancelar a citação; bloqueio em grupo restrito a administradores

**Em parte**

- Rascunho por conversa — Fica só em memória e se perde ao recarregar (MessageComposer.tsx:21).
- Anexar foto ou vídeo, documento e figurinha; colar imagem; limite de 45 MB — Envia direto ao escolher ou colar, sem pré-visualização, legenda ou confirmação (MessageComposer.tsx:287-300 e 372-407).

**Não funciona / enfeite**

- Sugestões automáticas de resposta — Nunca aparecem: só são geradas quando existe replyingTo (linhas 85-108) e só são renderizadas quando não existe (linhas 617-620).

### Cara de IA

- Frases enlatadas e inventadas: 'Temos condições especiais esta semana', 'O prazo estimado é de 3 a 5 dias úteis', 'Consigo agilizar para entrega amanhã' e uma com emoji (MessageComposer.tsx:90-103). Se o código for corrigido sem trocar o texto, viram promessas falsas ao cliente.
- Chips indigo com lâmpada, cor que não existe no restante do app (MessageComposer.tsx:628-633).
- A barra de gravação tem fundo rose, ponto com animate-ping e animação de entrada (AudioRecorder.tsx).
- O tooltip 'Anexar qualquer arquivo ou documento' é prolixo (MessageComposer.tsx:608).

---

## 7. Inbox: Importar e Exportar (modal)

`ImportExportModal.tsx e routes/api/sync/import.ts`

### Funções

**Em parte**

- Exportar a conversa atual em TXT ou JSON — Só as mensagens carregadas na tela. A mídia sai como link.
- 'Backup Geral' de todas as conversas em JSON — Só metadados das conversas carregadas e filtradas, sem mensagens (linhas 135-152). A importação não reconhece a chave 'conversations' (linhas 198-203), então o backup não reimporta.
- Importar contatos por CSV, JSON ou texto colado (até 2 MB) — Grava no backend, mas a tela lê data.imported (linhas 233-236) e a API devolve contactsImported (import.ts:238), então a contagem aparece como 'undefined'. Rejeitados não são informados. Grupos importados ganham a última mensagem inventada 'Grupo sincronizado' (import.ts). Contato individual entra em whatsapp_contacts e não cria conversa. O CSV é dividido sem tratar aspas nem cabeçalho.

### Cara de IA

- Ícone no cabeçalho, título 'Importação & Exportação' e subtítulo genérico 'Gerencie histórico e contatos do WhatsApp' (ImportExportModal.tsx:267-282).
- Cartões idênticos, e todos os botões têm ícone (linhas 341-422).
- Placeholder com 'João Silva' e 'Maria Santos' (linha 471).
- 'Arquivo JSON estruturado gerado com sucesso', 'sincronizados com sucesso!' e botão 'Importar Agora' (linhas 131, 487, 505).

---

## 8. Inbox: Dados do contato (modal)

`BusinessProfileModal.tsx e /api/chats/$id/business-profile`

### Funções

**Funciona**

- Abrir e-mail ou site; fechar

**Em parte**

- Ver foto, nome e perfil comercial (descrição, categoria, endereço, e-mail, sites e horários) — Somente leitura, sem dados de CRM. Horário ausente é preenchido com '08:00 - 18:00' inventado (linha 368).

### Cara de IA

- Cada campo tem um ícone em caixa e um cartão (linhas 254-378).
- Selo 'Conta Comercial Verificada' mostrado para qualquer conta Business (linhas 224-225), afirmando uma verificação que o código não checa.
- Botões de fechar duplicados, o X e 'Fechar' no rodapé (linhas 195 e 386).

---

## 9. Conexões

`/?view=conexoes (ConnectionManager.tsx)`

### Funções

**Funciona**

- Atualizar status; criar conexão com ID técnico e nome opcional
- Editar o nome exibido
- Excluir conexão, com confirmação
- 'Ver Conversas', filtrando o Inbox pela conta

**Em parte**

- Ver e reconectar números desconectados — Desconectados são ocultados (ConnectionManager.tsx:192; useInstances.ts, filtro 'disconnected'). Só quem está em 'connecting' mostra o botão 'Conectar WhatsApp'. O comentário diz que a sessão é removida no servidor.

### Cara de IA

- Cabeçalho com 'Gerencie sessões, pareamento e disponibilidade dos canais conectados.' (ConnectionManager.tsx:205), repetindo a topbar.
- Estado vazio com quadrado verde de QR e botão 'Conectar WhatsApp Agora' (linhas 233-253).
- Grade de cartões idênticos com 'Status: Conectado', embora a lista quase só tenha conectados (linhas 257-390).
- Botões primários inconsistentes: branco ou preto na página e verde no modal (linhas 224, 249, 488). O raio varia entre lg, xl e 2xl.
- Jargão exposto: 'identificador técnico usado pela Evolution' e 'instância' (linhas 430-445).

---

## 10. Conexões: diálogo de QR Code

`QrCodeDialog.tsx`

### Funções

**Funciona**

- Gerar, atualizar e tentar de novo o QR; ver a confirmação de conexão; fechar

### Cara de IA

- rounded-3xl com ícone em caixa, pílula e subtítulo (linhas 177-206), diferente dos drawers.
- 'WhatsApp Conectado com Sucesso!' em maiúsculas de título, com círculo verde (linhas 228-233).
- Caixa 'Como conectar' com três passos e verdes em hex (linhas 282-300).

---

## 11. CRM

`/?view=crm (CrmView, drawers de novo lead e detalhes, modal de etapa)`

### Funções

**Funciona**

- Mover lead arrastando ou pelo seletor; mostrar mais
- Abrir e editar o lead (etapa, valor, nome, empresa, telefone, e-mail e notas)
- Excluir lead, com confirmação
- Criar, editar (nome, cor e tipo), reordenar e excluir etapa — Etapa com leads não pode ser excluída.

**Em parte**

- Atualizar, buscar lead e alternar entre Quadro e Lista (abas de etapa em tela estreita) — A lista mostra no máximo 300 leads.
- Novo lead — O drawer pede só nome e valor. O restante é editado depois.

### Cara de IA

- Cada cartão tem clique, arraste, lixeira e um select de etapa sempre visível, o que é redundante e polui o quadro (ProductViews.tsx:~1255-1328).
- 'Sem valor' e as tags de origem se repetem nos cartões (ProductViews.tsx:~1296-1307).
- A paleta de 8 cores no estilo Tailwind inclui violeta e rosa (ProductViews.tsx:797-806).

---

## 12. Clientes

`/?view=clientes (ClientsView, drawers de novo cliente e Tags)`

### Funções

**Funciona**

- Buscar, filtrar por origem ou tag e sincronizar com o WhatsApp
- Novo cliente

**Em parte**

- Importar CSV — Colunas fixas Nome, Telefone e E-mail. Cria um lead por requisição, em lotes de 10, e só deduplica contra a lista carregada, que pode estar filtrada pela busca (ProductViews.tsx:5060+).
- Exportar CSV — Ignora os filtros de origem e tag e não inclui tags (ProductViews.tsx:5118+).
- Selecionar em massa e aplicar tag — Não há como remover a tag.
- Criar tag — Cor fixa cinza #71717a, sem editar nem excluir (ProductViews.tsx:5661).
- Ver histórico do cliente (mensagens, follow-ups e agenda) e valor negociado — O histórico abre no fim da tabela, longe da linha clicada. Uma falha aparece como 'Nenhum evento recente'.
- Editar ou excluir cliente — A tela não oferece nenhuma das duas ações. A edição só é possível pelo CRM.

### Cara de IA

- Cinco ações no cabeçalho mais barra de busca, segmentos e tags (ProductViews.tsx:~5175-5290).
- Todos os pontos de tag saem do mesmo cinza, então não diferenciam nada (linha 5661).
- O histórico usa quadrados emerald, amber e sky com ícones, em estilo diferente do sistema ux (linha ~5501).
- As linhas sem dados mostram '—' em várias colunas.

---

## 13. Follow-up

`/?view=follow-up (FollowUpView, drawer Nova tarefa)`

### Funções

**Funciona**

- Filtrar Pendentes, Atrasadas, Concluídas e Todas, agrupadas por prazo; atualizar
- Criar tarefa com prazo, prioridade, cliente e observação

**Em parte**

- Concluir, reagendar e excluir — Não dá para reabrir a tarefa nem editar título, prioridade, cliente ou nota.

**Não funciona / enfeite**

- Lembrete no prazo — O drawer diz 'Você será lembrado no prazo definido' (ProductViews.tsx:2269). Não achei envio de lembrete: routes/api/cron só tem evolution-recover e privacy-retention.

### Cara de IA

- O subtítulo explica o óbvio com 'Conclua com um clique' (ProductViews.tsx:2035).
- O estado vazio lista exemplos genéricos, 'retornar clientes, enviar propostas ou confirmar pagamentos' (ProductViews.tsx:~2115).

---

## 14. Calendário

`/?view=calendario (CalendarView, drawers de agendamento e Criar agenda)`

### Funções

**Funciona**

- Navegar por mês, ir para Hoje e selecionar o dia (duplo clique agenda)
- Criar e remarcar agendamento (cliente e agente opcionais) — O servidor valida conflito e capacidade segundo o texto da tela; não revisei as regras.
- Cancelar agendamento

**Em parte**

- Criar a primeira agenda — Horário fixo de segunda a sexta, das 9h às 18h, sem edição de disponibilidade. O fuso é digitado como texto livre.
- Editar a agenda ou criar outra — Sem interface: o botão só existe quando não há agenda (ProductViews.tsx:4403-4420), apesar de 'Você pode ajustar depois' (linha 4801). O backend aceita atualização (calendar-clients.server.ts:340+).
- 'X de Y horários ocupados' e painel de configuração — Usam a capacidade da agenda selecionada no formulário, mas somam agendamentos de todas as agendas.

### Cara de IA

- Há três botões de novo agendamento (cabeçalho, rodapé do dia e duplo clique).
- O painel de configuração é só leitura, com cara de ajuste que não se pode alterar.
- A descrição do drawer explica o que o sistema faz por baixo: 'Conflitos e capacidade… verificados ao salvar'.

---

## 15. Agentes

`/?view=agentes (AgentsView, drawers de editor e teste)`

### Funções

**Funciona**

- Escolher um modelo (Pré-vendas, Suporte, Agendamento), ver a conversa de exemplo, usar o modelo ou começar do zero — A conversa é um texto fixo e só aparece quando não há agentes.
- Criar e editar agente: identificação, conexão, provedor e modelo, comportamento, modo de resposta, criatividade, tokens, grupos, transferência, contexto e permissões de agenda — Verifiquei o salvamento na API, não o efeito de cada campo no atendimento.
- Ativar ou desativar, excluir um ou vários, com confirmação — A exclusão em massa é sequencial.
- Status do provedor e das conexões; atividade recente — A atividade mostra até 8 execuções e não abre a resposta.

**Em parte**

- Testar agente — Chama /api/agents/test, mas cada mensagem é avaliada sem o histórico, embora a interface pareça um chat.

**Não funciona / enfeite**

- Polegar para cima ou para baixo nas respostas — Salvo só no localStorage, nunca vai ao servidor nem influencia o agente (ProductViews.tsx:2598 e 2699).

### Cara de IA

- Três modelos com ícone e conversas roteirizadas, animadas em sequência. Uma delas promete lembrete: 'Te mando um lembrete no dia. Até lá!' (ProductViews.tsx:2396-2490, especialmente 2472).
- O robô promete três horários e 'consultor' em exemplos genéricos (linhas 2405-2470).
- O painel Status repete dados do cabeçalho da lista e das conexões.
- Quase todo campo, seção e painel tem frase de ajuda, e o editor ainda tem cinco abas âncora (ProductViews.tsx:~3600-3930).
- Os polegares usam emerald e red do Tailwind, fora dos tokens ux (ProductViews.tsx:~3515-3550).

---

## 16. Base de conhecimento

`Painel lateral dentro de Agentes`

### Funções

**Funciona**

- Adicionar, editar e remover documento de texto, com confirmação
- Ligar a base por agente — É uma caixa única; não dá para escolher documentos.

**Em parte**

- Enviar arquivo ou URL, pausar ou ativar documento — Só texto colado. O selo 'Pausado' existe, mas não há controle para mudar 'active' (ProductViews.tsx, formulário no painel knowledge-title).

### Cara de IA

- A função está espremida em uma coluna lateral, com texto de apoio 'Ficam só neste workspace' (ProductViews.tsx:~3362).
- Os três painéis laterais idênticos entram escalonados com animação.

---

## 17. Toasts e confirmações

`components/ui/ToastProvider.tsx, sonner.tsx, ConfirmDialog.tsx`

### Funções

**Funciona**

- Ações no toast: tentar de novo (envio) — sendFailed passa o telefone no lugar do nome do contato (useMessages.ts:~492).
- Confirmação de ações destrutivas

**Em parte**

- Avisos de sucesso, erro, atenção e informação, com botão de fechar — Têm descrição genérica automática e título de erro errado. Só networkError, sendFailed e QR/instância têm id para não duplicar; os sucessos empilham.

### Cara de IA

- 'A alteração foi salva.', 'Confira a informação e continue quando estiver pronto.' e 'Revise os dados antes de continuar.' são textos automáticos de preenchimento (ToastProvider.tsx, success, info e warning).
- Vários textos terminam em 'com sucesso' (ProductViews.tsx, chamadas de run(); ImportExportModal.tsx:113-150).

---

## 18. Configurações: cabeçalho e navegação

`/?view=configuracoes (src/features/inbox/components/SettingsView.tsx)`

### Funções

**Funciona**

- Navegar entre as seções pela lateral, que destaca a seção conforme a rolagem

**Em parte**

- Atualizar os dados (ícone no topo) — Chama só refreshCore (perfil, workspaces, segurança, documentos). Não recarrega empresa, membros nem privacidade (SettingsView.tsx:771-800).

### Cara de IA

- Título seguido de frase que só lista as seções ao lado (SettingsView.tsx:1100-1103).
- Toda seção repete o mesmo molde: ícone decorativo em quadrado, título e descrição (342-355 e styles.css:5348).
- Há descrições em jargão de implementação: 'registradas no backend', 'registrados no backend', 'persistido no backend' (1337, 1974, 2231).
- Toda ação mostra o aviso na página e também um toast com o mesmo texto (846-853, 1119).
- O toast de sucesso sempre acrescenta 'A alteração foi salva.', inclusive em 'Código enviado' e 'Exportação pronta' (components/ui/ToastProvider.tsx:79).
- Qualquer erro, inclusive de validação, vira toast com o título 'Conexão indisponível' (ToastProvider.tsx:68; SettingsView.tsx:796,853).
- Campos sem placeholder recebem 'Digite <rótulo>' automaticamente, como 'Digite telefone atual' (281).
- Tamanhos de 9, 10, 11 e 12px escritos na mão, com um remendo no CSS que força 9 e 10px para 12px (styles.css:5367).
- Cartões idênticos aninhados (rounded-xl com border-current/5). Os botões usam rounded-xl por cima de ux-btn, que tem outro raio (330, styles.css:3586, 5372).

---

## 19. Configurações: Perfil

`SettingsView.tsx, seção Perfil`

### Funções

**Funciona**

- Editar nome e sobrenome e salvar
- Ver e-mail e telefone atuais — Somente leitura, mas com aparência de campo editável (1163-1164).

**Em parte**

- Trocar avatar (JPG, PNG ou WEBP) — O upload grava avatar_path (server/auth/profile.server.ts:300-320), mas não encontrei tela que exiba a imagem nem prévia dela (1170-1188).

### Cara de IA

- A descrição explica a arquitetura: 'Dados do usuário autenticado... fluxos de confirmação separados' (1149).
- 'Trocar avatar' é um label de 10px e 36px de altura ao lado de um botão de 44px (1170).

---

## 20. Configurações: Empresa

`SettingsView.tsx, seção Empresa`

### Funções

**Funciona**

- Nome da marca — Aparece no shell (InboxShell.tsx:113-116), nos convites e nos documentos legais da API.

**Em parte**

- Criar ou editar razão social, nome fantasia, CNPJ e telefone — No primeiro cadastro, razão social e CNPJ válido são obrigatórios (profile.server.ts:250-256). O campo não tem máscara nem aviso prévio. O CNPJ fica como 'unverified'.
- E-mail de suporte e nome do remetente — Confirmei o uso nos e-mails de convite (workspaces.server.ts:209-248; admin-invitations.server.ts:73-138). Os e-mails de código não recebem essa marca.
- Trocar logo — Só há um upload, desabilitado até a empresa existir. Não há prévia, remoção, versões clara e escura nem favicon, embora o shell leia esses campos (InboxShell.tsx:117-122).

**Não funciona / enfeite**

- Domínio personalizado — Só grava o valor com status 'pending' (profile.server.ts:227-229). Não encontrei verificação nem roteamento (SettingsView.tsx:1250-1256).
- Acento visual (Neutro, Teal, Índigo, Âmbar) — accent_token é salvo, mas nenhuma tela o lê (SettingsView.tsx:1258-1277; profile.server.ts:225).
- Ativar identidade white-label — A flag é salva e só aparece no health check (SettingsView.tsx:1278-1291; routes/api/health.ts:92). A marca é aplicada com ou sem ela.

### Cara de IA

- Faixa com 'nome · owner' mostra o papel cru em inglês (1198-1202).
- 'Teal', 'white-label' e 'Acento visual' são jargão (1260-1290).
- Status de domínio diferente de 'pending' aparece cru (1293-1301).

---

## 21. Configurações: Segurança

`SettingsView.tsx, seção Segurança`

### Funções

**Funciona**

- Alterar e-mail, confirmando o atual e depois o novo, com cancelamento — Não há reenvio de código.
- Encerrar outras sessões — Executa sem confirmação (1552-1561).

**Em parte**

- Alterar senha em três passos: código, confirmação e nova senha, com logout ao final — Não há cancelar nem reenviar. A tela só exige 8 caracteres, sem o medidor usado no cadastro (1350-1403, 1062-1085).
- Alterar telefone com código — O código vai para o e-mail, não para o telefone (server/auth/phone-change.server.ts:78-80), então o número não é verificado. O 'Cancelar' só limpa a tela. O país é um texto de 2 letras (1490).

### Cara de IA

- Textos de apoio em jargão: 'Persistido em E.164 somente depois da confirmação' e 'sessões de aplicação' (1485, 1549).
- Três cartões iguais, cada um com título, microtexto e botão 'Alterar' (1341-1545).
- O botão apenas 'Encerrar' é vago (1562).

---

## 22. Configurações: Dispositivos e modal de sessões

`SettingsView.tsx, seção Dispositivos e diálogo 'Todas as conexões e sessões'`

### Funções

**Funciona**

- Ver o resumo e a conexão mais recente — A prévia mostra apenas 1 item (678).
- Abrir o modal com todas as conexões (Esc, foco preso, Concluir)
- Remover a confiança de um dispositivo
- Revogar um dispositivo — Sem confirmação.
- Encerrar uma sessão específica no modal — Sem confirmação.

### Cara de IA

- Erro visível de plural: gera 'sessãoões' (532 e 1581-1587) e 'conexãoões' (2364).
- O modal tem eyebrow em maiúsculas 'Segurança da conta', título e explicação de agrupamento: 'Cada dispositivo aparece uma única vez...' (2315-2326).
- O rodapé repete a contagem e o botão 'Concluir' duplica o X (2362-2367).
- Nomes genéricos 'Conexão 1', 'Dispositivo 2' e 'Sessão neste dispositivo' repetidos (497-503, 560).

---

## 23. Configurações: Workspace (membros e permissões)

`SettingsView.tsx, seção Workspace`

### Funções

**Funciona**

- Trocar o workspace ativo
- Atualizar os dados do workspace
- Criar workspace
- Mudar o papel de um membro
- Suspender ou reativar membro — Sem confirmação.
- Editar as permissões de um membro
- Remover membro — Um clique, sem confirmação (1852-1863).
- Listar e revogar convites pendentes — Sem confirmação.

**Em parte**

- Convidar por e-mail com papel e permissões personalizadas — Funciona para quem ainda não tem conta. O link vai para /auth/register (workspaces.server.ts:228) e /api/workspaces/invitations/accept não tem chamada na interface. Conta existente tende a receber falha no cadastro (registration.server.ts:166-171).

### Cara de IA

- Cada membro vira um cartão com select, 'Salvar papel', 'Suspender', 'Permissões' e 'Remover' sempre expostos (1767-1865).
- Status do membro cru, como 'active' (1772).
- Rótulo 'billing' em inglês nas permissões, mesmo com billing desligado (SettingsView.tsx:87-88).
- A descrição lista as funções da própria seção (1632).

---

## 24. Configurações: Privacidade

`SettingsView.tsx, seção Privacidade`

### Funções

**Funciona**

- Ação ao desconectar o WhatsApp (apagar ou manter) — Lida em server/evolution/instance-lifecycle.ts:80-85. O padrão é apagar.
- Permitir IA e redigir PII antes da IA — Lidas em workspace-product.server.ts:869-876.
- Salvar a política
- Ver atividade de privacidade e histórico de consentimentos — Os 20 mais recentes.

**Em parte**

- Retenção de mensagens e de mídia — Depende de ENABLE_PRIVACY_RETENTION=true e do cron diário (routes/api/cron/privacy-retention.ts:19). Processa até 40 workspaces por execução, sem ordenação ou paginação (worker.server.ts). O campo força o mínimo 1 enquanto se digita.
- Solicitar exportação e baixar — Depende do mesmo worker diário, com limite de 5.000 linhas por tabela e 50 MB. Tabelas com erro são puladas. A tela mostra só a última solicitação, então uma exportação pronta some se houver outra mais nova (2127-2142).
- Solicitar exclusão — RISCO: um clique, sem confirmação, agenda a exclusão do workspace para 7 dias (2113-2119; privacy.server.ts, executeAfter). Não há botão de cancelar e a execução depende do worker.
- Solicitar correção — Não há campo para dizer o que corrigir. O worker só marca 'manual_review' (worker.server.ts, processRequest) e o ADM não tem tela para tratar o pedido.
- Ver documentos legais com versão e aceite e abri-los — A lista vem do banco, mas 'Abrir' mostra o texto estático do código, que pode ter outra versão (2185-2216).

**Não funciona / enfeite**

- Importação de histórico (a partir da conexão ou não importar) — import_history_policy só é gravado (server/privacy/privacy.server.ts:113-115). Não encontrei leitura em src/server fora disso (SettingsView.tsx:1995-2016).

### Cara de IA

- Códigos crus: tipo e status da solicitação (2129-2132) e ações de auditoria como privacy.settings.update (2155).
- 'Redigir PII antes da IA' é anglicismo técnico (2103).
- 'Sem histórico anterior à conexão...' é texto fixo que não acompanha a opção escolhida (1983).

---

## 25. Configurações: Plano e cobrança

`SettingsView.tsx, seção Plano (só com VITE_ENABLE_BILLING=true)`

### Funções

**Em parte**

- Ver status, plano, provedor e período — Somente leitura, sem checkout, e oculta por padrão. A API devolve 404 sem a flag do servidor.

### Cara de IA

- Quatro mini-indicadores com valores vazios ou 'não configurado' (2252-2276).
- Texto de bastidor ao usuário: 'Nenhum checkout ou cobrança fictícia foi criado. O backend já mantém o contrato de billing...' (2281-2286).

---

## 26. ADM: acesso, acesso negado e cabeçalho

`/admin (src/routes/admin.tsx)`

### Funções

**Funciona**

- Validar sessão e papel de System Admin, ou mostrar 'Acesso restrito' com volta ao sistema
- Voltar, alternar tema e sair
- Trocar de aba conforme o papel (com setas do teclado) e atualizar dados

### Cara de IA

- Título duplicado: 'Inbox OS · Administração' com 'Control plane · superadmin' cru (admin.tsx:119-126) e, logo abaixo, 'Administração global' com 'Controle independente de workspaces · papel' (SystemAdminView.tsx:461-466).
- ShieldCheck decorativo no cabeçalho e na tela de bloqueio.
- As abas são uma fileira de botões contornados iguais às ações, e 'Atualizar dados' fica solto como mais um (468-537).
- Erro e sucesso aparecem no inline e no toast ao mesmo tempo (355-364, 520-531).
- Tema montado com ternários de hex e branco/preto com alfa, sem usar os tokens ux-* das Configurações (237-256).

---

## 27. ADM: Visão geral

`/admin, aba overview`

### Funções

**Em parte**

- Ver contagens de workspaces, instâncias, leads, membros ativos e eventos com falha — Dados reais, mas sem período, detalhe ou clique.

### Cara de IA

- Bug de rótulo: 'instances' e 'activeMembers' aparecem crus. O mapa tem users e messages24h, que a API não envia (admin/admin-presentation.ts:1-7; server/admin/admin-operations.server.ts:34-40).
- Grade de cinco cartões de número idênticos dentro de uma caixa 'Indicadores globais' (539-553).

---

## 28. ADM: Usuários e ficha do cliente

`/admin, aba users (inclui AdminCustomerDetails)`

### Funções

**Funciona**

- Listar 50 por página
- Suspender ou reativar usuário, com confirmação e justificativa — A justificativa é um campo único no topo, compartilhado com a aba Workspaces.
- Links de e-mail e telefone (mailto e tel)

**Em parte**

- Filtrar por e-mail ou ID — Filtra só a página atual e, ao filtrar, desativa 'Próxima' (636).
- Abrir a ficha do cliente (dados, acessos, workspaces e instâncias) — Somente leitura, até 25 workspaces. Abre abaixo da lista e da paginação.

### Cara de IA

- UUID exibido em cada linha (589-591).
- Título de caixa sem sentido, 'Suspensão, sessões e contas', e aviso redundante (562-566).
- Ficha em quatro cartões iguais com subtítulo 'Consulta administrativa somente leitura' (admin/AdminCustomerDetails.tsx).
- Status e papel crus na ficha (mesmo arquivo).

---

## 29. ADM: Workspaces, membros e convites

`/admin, aba workspaces`

### Funções

**Funciona**

- Listar e paginar
- Suspender ou reativar workspace com confirmação
- Revogar convite com confirmação

**Em parte**

- Filtrar por nome ou slug — Só a página atual.
- Editar papel e status de membros — Membros são identificados só por UUID (747). Salvar não pede confirmação.
- Convidar por e-mail — Mesma limitação: o link leva ao cadastro e conta existente não tem tela de aceite (admin-invitations.server.ts:118).

### Cara de IA

- Mostra 'Workspace: <uuid>' em vez do nome (741).
- Texto cita o fornecedor: 'enviados pelo Resend' (799-802).
- Painéis abrem no fim da página, sem estado vazio.

---

## 30. ADM: Serviços (integrações)

`/admin, aba integrations`

### Funções

**Funciona**

- Selecionar e editar nome, URL, ativação e modelos liberados — O formulário começa com a chave 'evolution' e os demais campos vazios, sem carregar a integração (279-283).
- Testar conexão
- Rotacionar segredo — Sem confirmação. A API devolve máscara, versão, data de rotação e último teste (integration-vault.server.ts:150-175), mas a tela não mostra nada disso.

**Em parte**

- Criar integração custom (caminho de teste, cabeçalho, prefixo, segredo) — Armazena e testa. Não identifiquei no inventário quem consome uma integração custom no produto.

### Cara de IA

- Todos os cartões repetem 'Configuração protegida · segredo nunca exibido' (917-919).
- Explicação de criptografia e chave mestra (898-901) e outro texto longo sob os modelos liberados.
- Placeholders automáticos 'Digite chave de identificação' (Field, 177).
- Salvar, testar e rotacionar têm o mesmo peso visual.

---

## 31. ADM: Newsletter

`/admin, aba newsletter (campanhas, audiência, editor, prévia, upload)`

### Funções

**Funciona**

- Criar segmento e adicionar contato com consentimento — Via Resend. Não lista nem remove contatos.
- Editar blocos (6 tipos, mover, excluir, adicionar) — Trocar o tipo apaga o conteúdo do bloco.
- Salvar rascunho — Sem campos de texto de prévia ou nome do remetente, embora a API aceite.
- Enviar imagem ou vídeo (até 3 MB)

**Em parte**

- Listar campanhas e editar rascunhos — Não há 'Nova campanha': depois de editar, createdCampaignId permanece e 'Salvar' sobrescreve o mesmo rascunho (1117-1129, 1360-1378). Não há excluir.
- Prévia aproximada — Renderizador separado do HTML enviado (NewsletterPreview.tsx contra newsletter-render.ts).
- Enviar campanha com confirmação — Sem teste de envio nem agendamento. Falha ambígua deixa a campanha em 'queued' para conferência manual no Resend. Envia a última versão salva, não edições pendentes.

### Cara de IA

- Conteúdo inventado pré-preenchido: bloco 'Novidades' (340-343), 'Imagem da campanha' e 'Assistir ao vídeo' (1440-1455).
- Tipos de bloco em inglês e placeholders 'src', 'alt', 'href', 'thumbnail', 'label' (1255-1345).
- 'ID do segmento Resend' é um campo manual, apesar do select de segmentos acima (1239).
- UUID e status cru em cada campanha (1115-1118).
- Emoji ▶ e rótulo 'Sem enviar' na prévia, com ressalva repetida (admin/NewsletterPreview.tsx).
- Input de arquivo nativo sem estilo (1417-1422).

---

## 32. ADM: Auditoria

`/admin, aba audit`

### Funções

**Em parte**

- Ver as 100 últimas ações — Sem filtro, paginação, autor identificado ou metadados na tela, que a API retorna.

### Cara de IA

- Linhas cruas 'action · target_type/uuid · role' (1565-1569).
- Cartões idênticos sem estado vazio.

---

## 33. ADM: Administração (System Admins)

`/admin, aba admins (só superadmin)`

### Funções

**Funciona**

- Listar admins e clicar para preencher o formulário — A linha não parece clicável.
- Adicionar, alterar papel ou suspender, com confirmação — Somente usuários já cadastrados; o último superadmin é protegido.

### Cara de IA

- Papel e status crus na lista (1487).
- Mistura 'System Admin' com 'Administradores globais' (1471-1492).
- Duas caixas com texto explicativo para uma lista e um formulário.

---

## 34. Login e confirmação de dispositivo

`/auth/login (src/routes/auth/login.tsx)`

### Funções

**Funciona**

- Entrar com e-mail e senha, com Turnstile quando configurado
- Lembrar de mim (confiar no dispositivo) — O rótulo não diz que isso confia no dispositivo.
- Código do dispositivo: confirmar, reenviar e voltar — É um passo interno do login, não uma rota própria.
- Redirecionar para ?next= interno e pular o login se já houver sessão
- Ir para cadastro ou recuperação e alternar tema

### Cara de IA

- Fundo ASCII animado (features/auth/components/AsciiBackdrop.tsx), efeito decorativo típico.
- Subtítulo genérico 'Acesse seu workspace e continue seus atendimentos' (login.tsx:186).
- No passo do código há três botões de largura total empilhados.

---

## 35. Cadastro

`/auth/register`

### Funções

**Funciona**

- Escolher pessoa física ou empresa (com CNPJ)
- Ler e aceitar os termos no modal
- Criar conta e receber código

**Em parte**

- Seletor de país com bandeira e telefone — Menu próprio sem navegação por setas; fecha com Esc só quando o foco está no gatilho.
- Senha, confirmação e medidor de força — Não avisa que as senhas diferem nem por que o botão está desabilitado.
- Cadastro por convite (invitationId e invitationToken) — Funciona só para e-mail novo. A tela não informa que há convite, não preenche o e-mail e continua com o título 'Novo workspace'.

### Cara de IA

- Molde eyebrow 'Novo workspace', título e subtítulo 'Seus dados serão usados para preparar...' (register.tsx:224-226).
- Texto técnico 'Será armazenado como +55...' (por volta da linha 345).
- Placeholders inventados 'Ana' e 'Souza'.
- Medidor com '8+ caracteres' e nível soltos (AuthShell.tsx, PasswordMeter).

---

## 36. Verificação de cadastro

`/auth/verify`

### Funções

**Funciona**

- Reenviar com contagem de 60 s
- Voltar ao login

**Em parte**

- Confirmar o código e ir para o login — Redireciona sem mensagem de sucesso. Sem challengeId, o formulário fica morto e ainda diz 'Código enviado'.

### Cara de IA

- Texto copiado do login: eyebrow 'Verificação' e título 'Confirme este dispositivo', mas a tela confirma o cadastro (verify.tsx:83-85).
- 'Código enviado para o seu e-mail' repete a descrição.
- Placeholder de pontos, diferente do mesmo campo no login e na recuperação.
- 'Voltar' é um link com estilo inline.

---

## 37. Recuperação de senha

`/auth/forgot-password`

### Funções

**Funciona**

- Confirmar o código
- Definir nova senha, revogar sessões e voltar ao login — Sem mensagem de sucesso.

**Em parte**

- Pedir o código — Não checa response.ok: avança mesmo com erro 429 ou 500 (forgot-password.tsx, start). Sem challengeId, 'Confirmar' e 'Reenviar' ficam desabilitados, e o erro não aparece no passo do e-mail.
- Reenviar o código — Ignora falhas, mostra sempre a mensagem neutra e não tem contagem.

### Cara de IA

- Eyebrow 'Recuperação' e subtítulo de política interna 'A resposta inicial nunca revela se uma conta existe', repetido nos três passos (forgot-password.tsx:138-146).
- Padrões de eyebrow, reenvio e erro diferentes entre login, verificação e recuperação.

---

## 38. Modal de consentimento legal

`features/legal/components/LegalConsentDialog.tsx (aberto no cadastro)`

### Funções

**Funciona**

- Alternar entre Termos e Privacidade
- Aceitar, cancelar ou fechar

**Em parte**

- Rolar até o fim para liberar o aceite — Chegar ao fim de uma única aba, ou abrir uma aba curta, libera o aceite dos dois documentos.

### Cara de IA

- Placeholders expostos: badge 'Operador configurado' (153) e 'Políticas da o operador configurado' (289-290).
- Data fixa '15 de outubro de 2026' (222) contradiz '17 de outubro' dos textos (features/legal/legal-documents.ts).
- Eyebrow com escudo, badge, título e ícones nas abas.

---

## 39. Páginas legais (5)

`/legal/terms, /legal/privacy, /legal/cookies, /legal/payments, /legal/acceptable-use`

### Funções

**Em parte**

- Ler o documento e a versão — Usam texto estático. /api/legal/documents, com versão do banco e marca do workspace, não tem consumidor na interface.
- Voltar — Só existe 'Voltar ao cadastro', mesmo quando aberta pelas Configurações (LegalDocumentPage.tsx:8-9). Não há navegação entre documentos.

### Cara de IA

- Rodapé público 'Minuta técnica. Revisão jurídica recomendada antes do lançamento comercial' (LegalDocumentPage.tsx:23).
- Cookies, Pagamentos e Uso aceitável têm um parágrafo cada, num cartão grande quase vazio (legal-documents.ts, BODY).
- Textos de reserva 'Operador responsável' e 'e-mail de suporte configurado' aparecem sem as variáveis de ambiente (legal-documents.ts).
- Fundo escuro fixo (styles.css:1832-1847).

---

## 40. Erro 404 da raiz

`__root.tsx, NotFoundComponent`

### Funções

**Funciona**

- Voltar ao início ou ir para o login

### Cara de IA

- Cartão centralizado com ícone em quadrado, eyebrow 'ERRO 404', título, parágrafo e dois botões (__root.tsx:23-61).
- 'Temporariamente indisponível' não se aplica a um 404.
- Sempre branco, ignora o tema escuro.

---

## 41. Rota /404

`src/routes/404.tsx`

### Funções

**Funciona**

- Voltar ao início ou à página anterior

### Cara de IA

- Segunda versão do 404, com outro texto, ícone, padding, margens e botões diferentes do 404 da raiz (404.tsx:10-50).
- Sempre clara.

---

## 42. Rota /500

`src/routes/500.tsx`

### Funções

**Em parte**

- Recarregar ou voltar ao início — Rota estática. Não vi erro real direcionado para ela; recarregar apenas recarrega a própria /500.

### Cara de IA

- Rótulo 'Erro 500 / 505' (500.tsx:15-17).
- Texto corporativo e garantia não verificada: 'Seus dados continuam seguros'.
- Mesmo molde de cartão com ícone.

---

## 43. Erro de execução e erro SSR

`__root.tsx ErrorComponent; lib/error-page.ts via server.ts`

### Funções

**Funciona**

- Tentar novamente ou voltar ao início

### Cara de IA

- Eyebrow 'Status do Sistema' e 'retorne ao início seguro' (__root.tsx:70-110; lib/error-page.ts:117-119).
- Quatro implementações de tela de erro no total.
- Sempre brancas.

---

## 44. Carregamento e 'Dispositivo desconectado'

`src/routes/index.tsx e carregamento de /admin`

### Funções

**Funciona**

- Redirecionar ao login sem sessão
- Modal de sessão revogada com 'Ir para o login'

### Cara de IA

- O modal é sempre escuro e usa a classe auth-primary (index.tsx, Disconnected).
- /admin usa o texto 'Validando acesso administrativo…', enquanto o app usa uma barra.

---

## 45. Tela de autorização OAuth (sem rota)

`features/auth/ConsentView.tsx`

### Funções

**Não funciona / enfeite**

- Entrar e permitir ou recusar o acesso de um assistente — Código órfão: nenhuma rota ou componente importa ConsentView (ConsentView.tsx:38), então a tela é inacessível. FeaturePlaceholder.tsx também não é importado.

### Cara de IA

- Visual shadcn padrão, diferente do AuthShell (ConsentView.tsx:132-193).
- Mostraria mensagens de erro técnicas cruas.

---

## 46. E-mail: código de verificação

`server/email/templates.ts, verificationCodeEmail`

### Funções

**Em parte**

- Enviar código de cadastro, dispositivo, senha, e-mail ou telefone via Resend — Depende do Resend configurado. Fora do cadastro, todos os propósitos usam o texto 'confirmar esta ação'.

### Cara de IA

- Assunto, título e corpo genéricos, sem dizer qual ação (templates.ts:71-84).
- Cartão padrão com cabeçalho escuro, código em caixa cinza e 'Todos os direitos reservados' (56).
- Sem logo nem preheader.

---

## 47. E-mail: alerta de segurança

`templates.ts, securityAlertEmail`

### Funções

**Em parte**

- Avisar sobre alteração sensível — Sem link de ação, data, IP ou dispositivo no modelo.

### Cara de IA

- Mesmo molde e frase genérica 'encerre suas sessões e contate o suporte' (87-96), mesmo quando não há e-mail de suporte.

---

## 48. E-mail: convite de workspace

`templates.ts, workspaceInviteEmail`

### Funções

**Em parte**

- Enviar convite com botão 'Aceitar convite' — O botão leva ao cadastro, sem fluxo de aceite para conta existente.

### Cara de IA

- Não diz quem convidou nem quando expira (7 dias).
- Sem link em texto de reserva no HTML (98-109).

---

## 49. E-mail: newsletter

`server/admin/newsletter-render.ts`

### Funções

**Funciona**

- Gerar HTML por blocos com link de descadastro

### Cara de IA

- Sem cabeçalho, marca ou identificação do remetente no corpo. Visual diferente dos e-mails transacionais.
