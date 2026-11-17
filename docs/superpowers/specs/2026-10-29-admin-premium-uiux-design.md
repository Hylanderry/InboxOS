# Administração global — design e implementação

## Intenção

Transformar a rota `/admin` em um painel administrativo claro, seguro e premium para superadministradores. A experiência deve priorizar leitura de estado, ações críticas conscientes e uso eficiente em telas pequenas, sem alterar tipografia, paleta-base, APIs, autenticação, contratos de dados ou permissões.

## Escopo e não objetivos

- Escopo: `src/routes/admin.tsx`, `SystemAdminView.tsx`, tokens/classes CSS estritamente necessários e testes de contrato/visual dos componentes administrativos.
- Inclui as sete áreas: Visão geral, Usuários, Workspaces, Serviços, Newsletter, Auditoria e Administração.
- Não inclui: redesign de outras rotas, migrações, banco, Evolution, segredos, envio de newsletter ou alteração de papel de usuário.

## Prompt negativo — invariantes não negociáveis

Antes de qualquer patch, aplicar esta lista como critério de bloqueio. Se uma mudança exigir qualquer item abaixo, ela não entra nesta entrega.

- Não trocar a tipografia atual, suas famílias, pesos já usados ou a escala tipográfica estabelecida.
- Não criar cores de marca, azul-marinho, roxo, gradientes decorativos, neon, brilho artificial ou acentos fora dos tokens Trax existentes. Verde continua reservado a estados semânticos de WhatsApp/sucesso quando já aplicável.
- Não substituir o preto `black-hole`, off-white, neutros, Phosphor ou o sistema de temas por uma identidade visual paralela.
- Não aplicar glassmorphism como enfeite em todos os elementos, nem usar blur pesado, sombras empilhadas ou cards idênticos sem função informacional.
- Não trocar componentes, biblioteca de UI, rotas, APIs, contratos de dados, permissões, estado React ou lógica de backend para resolver assunto visual.
- Não introduzir CSS global genérico, `!important`, resets, larguras fixas, `100vh` que prenda teclado, nem esconder overflow para mascarar uma quebra.
- Não reescrever arquivos inteiros, eliminar testes, remover acessibilidade, alterar ícones existentes ou criar uma interface de dashboard com métricas inventadas.
- Não adicionar animação contínua, entrada em cascata, parallax ou transições que impeçam interação, foco ou automação. Movimento existe apenas para explicar a ação da pessoa.
- Não mudar texto funcional para linguagem promocional ou vaga; nenhuma ação crítica perde sua explicação, confirmação, aviso ou estado de erro.

## Guardas negativas por fatia

| Fatia | Pode mudar | Não pode mudar |
| --- | --- | --- |
| Estrutura, header e abas | Espaçamento, superfície, indicação de aba ativa, overflow controlado e foco. | Ordem das sete áreas, atalhos de teclado, rota `/admin`, labels acessíveis ou navegação por seta/Home/End. |
| Visão geral e listas | Rótulos humanos, hierarquia dos dados e adaptação de linhas para mobile. | Valores, consultas, paginação, dados de métrica, botões de suspensão ou regras de autorização. |
| Serviços | Agrupamento visual, aviso contextual, densidade e estados dos controles. | Campos enviados, criptografia, segredo, endpoints, teste de conexão ou exposição de valores confidenciais. |
| Newsletter | Organização progressiva do formulário, prévia e orientação visual. | Consentimento, limites de upload, conteúdo enviado, comportamento de salvar/enviar, Resend ou dados de audiência. |
| Auditoria e Administração | Leitura de eventos, badges semânticos, formulário e ações responsivas. | Registro de auditoria, papéis, proteção do último superadmin, UUIDs e regras de salvamento. |
| CSS e tokens | Classes administrativas escopadas que reutilizem tokens existentes. | Tokens globais sem justificativa, estilos de outras rotas, paleta base, fonte, tema ou componentes compartilhados não envolvidos. |

## Evidência da auditoria

| Severidade | Evidência observada | Mudança mínima | Restrição preservada |
| --- | --- | --- | --- |
| Alta | A 390px e 320px, abas e conteúdo administrativo ficam cortados horizontalmente. | Navegação de abas com overflow intencional, indicadores e área de toque; conteúdo passa a usar grid fluido. | Todas as abas e atalhos de teclado existentes. |
| Alta | Identificadores técnicos (`crmLeads`, `failedEvents`, `active`) chegam diretamente à interface. | Mapear rótulos e estados para linguagem de produto, mantendo os valores originais. | Dados e payloads da API. |
| Média | Ações críticas e neutras têm peso visual semelhante. | Variantes semânticas: principal, secundária, perigosa e silenciosa. | Phosphor, tipografia e cores funcionais existentes. |
| Média | Serviços e newsletter empilham campos, explicações e ações sem uma ordem clara. | Separar seleção, edição, segredo e ação em grupos progressivos. | Campos, validações, endpoints e mensagens existentes. |
| Média | A aba selecionada é pouco distinguível e o painel claro parece plano. | Superfícies de vidro sutis, estado ativo inequívoco e contraste AA. | Paleta neutra Trax, sem azul/navy, neon ou gradientes decorativos. |
| Investigação | Alguns botões visíveis não estabilizaram para o clique automatizado, mas funcionaram por teclado. | Investigar CSS de movimento/layout antes de mudar comportamento; regressão de teclado obrigatória. | Eventos e handlers atuais. |

## Direção escolhida

**Admin-first.** Um sistema de composição próprio da administração, construído sobre os tokens Trax existentes e reutilizável depois, sem criar um segundo design system global.

### Tokens e superfícies

- Fundo claro: continuar off-white `#f6f6f4`; fundo escuro: black-hole `#080809`.
- Texto, borda, card e foco: reaproveitar os tokens semânticos já definidos em `src/styles.css` (`--background`, `--foreground`, `--border`, `--ring`).
- Vidro: usar as três intensidades atuais (`glass-soft`, `glass-nav`, `glass-modal`) somente em superfícies com hierarquia; não aplicar blur em cada card.
- Raios: superfícies 16px, controles 12px, evitando pílulas indiscriminadas.
- Espaçamento: 4/8/12/16/24/32px; largura máxima e gutters existentes.
- Movimento: somente opacity/transform ou cores; 140ms para resposta de controle, 200ms para troca de aba e 280ms para painel. Respeitar `prefers-reduced-motion`.

### Composição

1. Cabeçalho operacional compacto: retorno, identidade, tema e saída mantêm áreas de toque de 44px; título e papel ficam alinhados ao conteúdo.
2. Navegação de áreas: em desktop, faixa de abas legível e ativa; em mobile, faixa horizontal com scroll acessível, sombra/indicador de continuação e tab ativa sempre trazida para a área visível. Não haverá quebra de abas em múltiplas linhas.
3. Cabeçalho de painel: título, explicação curta e atualizar dados em uma mesma zona; o botão passa para linha própria em telas estreitas.
4. Conteúdo: métricas com rótulo humano, valor dominante e estado contextual; listas administrativas em linhas responsivas que passam de ações laterais para uma pilha com botões de largura adequada no mobile.
5. Formulários: blocos com objetivo único, legenda e ajuda contextual junto ao campo; segredos e ações irreversíveis ficam em superfície distinta com aviso específico, não em toast solto.
6. Feedback: erros de painel ficam próximos da operação que falhou e com `role=alert`; sucesso curto pode usar toast. Estados loading e vazio preservam altura para evitar salto visual.

### Linguagem de interface

- `workspaces` → “Workspaces”, `instances` → “Conexões”, `crmLeads` → “Leads no CRM”, `activeMembers` → “Membros ativos”, `failedEvents` → “Eventos com falha”.
- `active`/`suspended`/`disabled` passam a rótulos localizados e badges semânticos que não dependem apenas de cor.
- Ações usam verbos consistentes: “Atualizar dados”, “Ver detalhes”, “Suspender usuário”, “Salvar integração”, “Testar conexão”.

## Responsividade e acessibilidade

- Testar 320, 360, 390, 768, 1024 e 1440px, além de altura 540px, zoom 200%, light/dark e motion reduzido.
- Sem rolagem horizontal da página; rolagem horizontal é permitida apenas dentro da faixa de abas, com acesso por teclado e foco visível.
- Controles prioritários com 44px quando viável; campos e botões nunca menores que 40px.
- Abas: ArrowLeft/ArrowRight/Home/End, `aria-selected`, foco visível e painel nomeado continuam obrigatórios.
- Formulários preservam label explícito, `disabled`, loading, erro, sucesso e instruções sem depender apenas da cor.

## Sequência de implementação e verificação

1. **Antes de editar:** mapear o componente, rotas, props, estado, chamadas de dados, classes compartilhadas e superfícies que reutilizam o mesmo estilo. Registrar screenshot, viewport, console e network da tela atual. Classificar se a mudança é só visual ou também altera estado/dados.
2. Criar testes de regressão para labels humanos, layout de abas mobile e estados/semântica de ação; executar e registrar a falha esperada antes do código.
3. Consolidar as classes administrativas em tokens locais e componentes auxiliares pequenos, sem mudar API ou estado.
4. Implementar por fatia: estrutura/abas → overview/listas → serviços → newsletter → auditoria/administração. Uma fatia só avança quando a anterior passa seus gates.
5. **Depois de cada fatia:** teste direcionado, typecheck, screenshot before/after, Playwright com teclado/touch e console/network. Conferir dados longos, loading, vazio, erro, sucesso, disabled e overflow real; corrigir truncamento ou foco perdido antes de seguir.
6. **Regressão de sistema:** após qualquer alteração em classe compartilhada ou componente reutilizado, conferir as rotas consumidoras e executar login → OTP → dashboard → administração. Não aceitar alteração visual que quebre essa jornada.
7. Ao final: `npm test`, `npm run audit:release`, `npm run lint`, `npx --no-install tsc --noEmit`, build Vercel e browser real nas seis larguras, teclado, tema e motion reduzido.

### Matriz obrigatória de impacto e evidência

| Tipo de mudança | Impacto a investigar antes | Validação obrigatória depois |
| --- | --- | --- |
| CSS ou token exclusivo do admin | Abas, painéis, modo claro/escuro e altura curta da rota `/admin`. | Screenshots 320/390/768/1440, tabulação, foco e ausência de overflow de página. |
| Classe compartilhada, controle ou superfície | Todas as rotas que usam a classe e possíveis conflitos de especificidade. | Rotas consumidoras abertas no browser, lint/typecheck e diff CSS revisado. |
| Tab, menu, drawer, modal ou subopção | Ordem de foco, Escape, clique fora, `aria-*`, foco de retorno e motion. | Playwright com teclado e mouse; screenshot do aberto/fechado; reduced motion. |
| Formulário, filtro, paginação ou ação administrativa | Payload, loading, erro, dados longos, permissões e ações destrutivas. | Teste de contrato/direcionado, network sem mutação não autorizada, estados loading/error/success/disabled. |
| Métrica, badge, lista ou dado assíncrono | Fonte de dados, nomes técnicos, cache, estado vazio e risco de truncamento. | Resposta real renderizada, textos extensos, zero/erro, leitores de tela e comparação com a API sem expor segredos. |
| Performance visual | Re-renderizações, layout shift, blur/sombra, imagens e bloqueio de interação. | Browser Performance/Network, console, screenshots e confirmação de que login/OTP/dashboard/rotas continuam funcionais. |

## Riscos e rollback

- Maior risco: CSS compartilhado alterar telas fora da administração. Mitigação: classes com escopo `admin` e tokens já existentes; rollback é reverter somente os arquivos da fatia.
- Maior risco de comportamento: mudar foco ou tabulação. Mitigação: preservar a implementação de tabs, adicionar teste e executar o fluxo por teclado no browser.
- Sem deploy, alteração de dados, newsletter, papel ou segredo nesta tarefa.
