# InboxOS responsivo premium — auditoria e reconstrução progressiva

## Objetivo

Fazer o InboxOS se comportar como aplicativo nativo no celular, tablet (retrato e paisagem) e desktop: superfícies fluidas, toque confortável, leitura estável, transições discretas e dados reais sempre compreensíveis. O trabalho preserva a identidade Trax, autenticação, rotas, multi-tenancy e todos os contratos de dados.

## Escopo ampliado

- Shell autenticado, navegação lateral/dock, cabeçalho, Dashboard, CRM, Clientes, Inbox, Follow-up, Calendário, Conexões, Agentes, Configurações e Administração global.
- Fluxos de login, OTP e rotas entram somente como regressão obrigatória; não são redesenhados ou alterados sem uma descoberta comprovada.
- O diagnóstico de carregamento inclui UI, chamadas de rede, estado React e transições entre views. Nenhuma tela de loading será removida sem uma alternativa que preserve estado, acessibilidade e recuperação de erro.

## Evidência inicial

| Área | Evidência no Playwright | Classificação |
| --- | --- | --- |
| Administração | Overflow/corte de abas, UUID e ações em 320/390px; labels técnicos; densidade excessiva em serviços/newsletter. | Confirmado visualmente |
| Dashboard e CRM mobile | Painel “Carregando…” ocupou a área principal enquanto o dock permaneceu visível. | Confirmado visualmente; causa pendente |
| Clientes/transição | Após transições rápidas, a interface ficou sem conteúdo enquanto `/api/workspaces/` permanecia pendente; endpoints de eventos, chats, instâncias e `/api/admin/me/` retornaram 200. | Confirmado em rede; causa pendente |
| Clique automatizado | Alguns controles visíveis não estabilizaram para o Playwright, mas puderam ser operados pelo teclado. | A investigar — não assumir causa CSS |

## Direção de produto

1. **Mobile como modo de trabalho, não desktop comprimido.** Dock inferior para rotas principais, topo compacto com ação contextual, painéis em uma coluna e sheets/drawers para navegação secundária.
2. **Tablet como transição de densidade.** Em retrato, listas e conteúdo convivem sem três colunas; em paisagem, painéis adicionais aparecem somente se mantiverem largura útil.
3. **Desktop como expansão, não outra interface.** Mesmos componentes e hierarquia; espaço extra revela contexto, não cria um conjunto paralelo de ações.
4. **Vidro Apple discreto.** Transparência fosca e profundidade leve apenas em chrome, drawers, modais e superfícies hierárquicas; sem gradiente, roxo, azul/navy, neon ou blur pesado.
5. **Loading deixa de ser tela morta.** Dados já carregados permanecem visíveis durante atualização; primeira carga usa skeleton estrutural de altura estável, estado vazio ou erro acionável conforme a causa. Nenhum spinner/painel “Carregando” bloqueia a navegação sem motivo.

## Invariantes negativas

- Não trocar tipografia, tokens Trax, preto `#080809`, off-white `#f6f6f4`, ícones Phosphor ou cores funcionais existentes.
- Não reescrever todo o app de uma vez, trocar biblioteca, adicionar UI kit, introduzir CSS global/reset/`!important`, fixar larguras ou ocultar overflow para disfarçar quebra.
- Não alterar auth, OTP, rotas, query params, RLS, APIs, payloads, permissões, banco, Evolution, newsletter, segredos ou dados reais para “consertar” UX.
- Não remover loading sem diagnosticar a fonte de dados e manter loading, erro, vazio, refresh, offline e recuperação explicitamente representados.
- Não produzir dashboard fictício, métricas inventadas, cards repetidos, pílulas em excesso, animação decorativa ou qualquer identidade paralela genérica.

## Estratégia obrigatória por superfície

1. Inventariar rota, componentes, origem de dados, estado assíncrono, dependências de viewport, interações e componentes compartilhados.
2. Capturar baseline Playwright em 320, 360, 390, 768 retrato, 768 paisagem, 1024 e 1440px; tema claro/escuro, reduced motion, 200% zoom e altura 540px quando aplicável.
3. Para qualquer falha, seguir entrada → estado → request → resposta → renderização antes de criar teste e corrigir a causa.
4. Escrever teste de regressão que falha; implementar uma única fatia; verificar teste, browser, console, rede, dados longos, loading/erro/vazio/sucesso, teclado e toque.
5. Se a classe for compartilhada, verificar todas as rotas consumidoras e a jornada login → OTP → dashboard → rota alterada.

## Critérios de aceite

- Sem corte, sobreposição, scroll horizontal de página, controle inalcançável, texto funcional ilegível ou ação atrás do dock/teclado.
- Alvos prioritários ~44px, campos/botões legíveis, foco visível, labels corretas, menus/modais fecháveis por Escape e comportamento equivalente por teclado/touch.
- Transições de 140–280ms baseadas em opacity/transform ou cor; reduced motion remove movimento sem eliminar feedback.
- Requests não duplicados, dados de outra view não vazam durante transição, erros não se apresentam como tela vazia e refresh não apaga conteúdo útil.
- Toda afirmação de responsividade é acompanhada de screenshot/registro de viewport, console e rede reais.

## Ferramentas e limites

- Playwright é a fonte de navegação, captura e repetição de fluxos. O Chrome DevTools MCP oficial foi configurado para próxima sessão e será usado para DOM/rede/performance quando houver Chrome/Edge disponível.
- Até existir Chromium nesta máquina, Firefox/Playwright fornece cobertura funcional e visual; limitações de motor devem ser marcadas como BLOCKED, não consideradas aprovadas.
- Nenhuma ação administrativa mutante, envio, suspensão, segredo, newsletter, conexão de WhatsApp ou deploy será executado durante a auditoria sem autorização específica.
