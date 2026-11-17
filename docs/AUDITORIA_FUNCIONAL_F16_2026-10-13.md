# Auditoria funcional — InboxOS Fase 16

Data: 13/10/2026  
Ambiente: servidor local `http://127.0.0.1:4173`  
Método: Playwright em contexto novo por página, com Supabase/Auth/API mockados e sem escrita externa.

## Resultado executivo

- Áreas autenticadas exercitadas: **10/10 PASS**.
- Rotas públicas exercitadas: **8/8 PASS**.
- Respostas HTTP `>= 400`: **0**.
- Requisições acima de 1,5 s: **0**.
- Erros de console: **0**.
- Erros de runtime (`pageerror`): **0**.
- Overflow horizontal nos fluxos públicos em 390 px: **0**.
- Testes automatizados do projeto: **319/319 PASS**.
- TypeScript: **PASS**.
- ESLint: **0 erros**, 6 avisos antigos de Fast Refresh.
- Auditoria estática de release: **PASS** (285 arquivos, 88 rotas, imports resolvidos).
- Build Vite/TanStack Start/Nitro Vercel: **PASS**.
- `/api/health` local com ambiente carregado: **200**, `database: reachable`, sem `schema: outdated`.

O resultado acima prova a integridade do código e da UI no ambiente isolado. Ele não substitui uma validação autenticada contra o Supabase/Evolution reais. Nenhuma mensagem foi enviada e nenhum webhook real foi escrito.

## Escopo e segurança

O roteiro seguro está em [`scripts/audit-functional-isolated.mjs`](../scripts/audit-functional-isolated.mjs) e [`scripts/audit-public-isolated.mjs`](../scripts/audit-public-isolated.mjs). Ele cria uma sessão de QA fictícia, intercepta `/api/**` e registra método, URL, status, duração, console, erros de runtime, campos, botões e screenshots. Os dados criados (lead, etapa, tag, follow-up, agendamento e agente) existem apenas na memória do teste.

Os artefatos estão em [`tests/e2e-artifacts/functional-audit-2026-10-13/`](../tests/e2e-artifacts/functional-audit-2026-10-13/), incluindo `audit.json`, `public-audit.json` e as capturas.

## Inventário por página autenticada

### Dashboard

Opções: navegação para Dashboard, CRM, Clientes, Inbox, Follow-up, Calendário, Conexões, Agentes, ADM global e Configurações; sair; ocultar navegação; alternar tema; atualizar métricas.

Teste executado: carregamento, atualização e leitura das métricas.  
Rede: `/api/dashboard/` retornou 200 em todas as chamadas; bootstrap também confirmou workspaces, instâncias, chats, eventos e sincronização em modo mock.  
Resultado: PASS.

### CRM

Opções: atualizar; criar lead (nome e valor); mover lead entre etapas; criar etapa; excluir lead; selecionar estágio; filtros e campos de pipeline.

Teste executado: criação de lead `Lead de auditoria`, criação de etapa `Etapa QA`, recarga do CRM e validação de retorno. A exclusão foi inventariada, mas não executada para evitar remover dados mesmo no fluxo de QA.

Rede: `GET/POST /api/crm/`, `POST /api/crm/stages`, novo `GET /api/events/`; todos 200 e sem timeout.  
Resultado: PASS.

### Clientes

Opções: pesquisar por nome, telefone, e-mail ou empresa; criar tag; selecionar clientes; atribuir tags em massa; limpar seleção; importar/exportar clientes.

Teste executado: criação da tag `Auditoria`, seleção do cliente, atribuição da tag, busca por `Cliente` e atualização sem nova sincronização cara (`sync=0`).

Rede: `GET /api/clients/?sync=1` apenas no primeiro carregamento; demais buscas usam `sync=0`; `POST/PATCH /api/clients/` e eventos retornaram 200.  
Resultado: PASS.

### Inbox

Opções: buscar conversas; filtros Todas, Não lidas, Grupos, Leads, Pessoais e Arquivadas; sincronizar mensagens; sincronizar fotos de perfil; importar contatos/exportar histórico; alternar tema; registrar cliente no CRM; ver perfil comercial; fixar; arquivar; mais opções; anexar foto/vídeo/documento; gravar áudio; escrever e enviar mensagem; timeline de mensagens.

Teste executado: busca, alternância de tema e carregamento de conversa realista com mensagem, avatar, telefone, status e composer. Controles destrutivos (arquivar, excluir, enviar mensagem real) não foram disparados.

Rede: o bootstrap mock confirmou `/api/chats`, `/api/chats/:id/messages`, `/api/events`, `/api/instances`, `/api/sync/evolution` e `/api/chats/sync-pfp`, todos 200.  
Resultado: PASS no contrato local; Evolution real, mídia e realtime remoto permanecem pendentes de staging autenticado.

### Follow-up

Opções: atualizar; criar tarefa; título/ação; data e hora; prioridade; concluir tarefa; excluir tarefa; associação com lead/chat.

Teste executado: criação de `Follow-up de auditoria`, recarga e presença do item na lista. Concluir/excluir foram apenas inventariados.

Rede: `GET/POST /api/follow-up/` e eventos retornaram 200.  
Resultado: PASS.

### Calendário

Opções: mês anterior/próximo; Hoje; selecionar dia; criar agenda; timezone; duração do slot; intervalo; capacidade diária; selecionar cliente; selecionar agente; criar agendamento; remarcar; cancelar.

Teste executado: Hoje, criação de `Agendamento QA`, seleção de calendário, carregamento de agentes/clientes e recarga realtime. Remarcar/cancelar foram inventariados sem mutar dados além do fixture.

Rede: `GET /api/calendar/`, `GET /api/agents/`, `GET /api/clients/?sync=1|0`, `POST /api/calendar/appointments` e `/api/events/`, todos 200.  
Resultado: PASS.

### Conexões

Opções: listar instâncias; Nova conexão; gerar/fechar QR; estado conectado/desconectado; Ver conversas; nome da instância; reconexão.

Teste executado: abrir e fechar o fluxo de QR em fixture com estado `open`. Não houve chamada à Evolution real.

Rede: `POST /api/instances/:name/qrcode` e `GET /api/instances/` retornaram 200.  
Resultado: PASS no contrato local; QR real depende de instância autorizada.

### Agentes

Opções: criar/editar/excluir agente; nome; objetivo; público; personalidade; tom; saudação; regras; assuntos proibidos; instruções adicionais; temperatura; tokens máximos; grupos; modo de resposta; instância; calendário; permissões `read/create/reschedule/cancel`; gatilhos de handoff; testar agente.

Teste executado: abertura do formulário, leitura dos campos, criação simulada e carregamento de calendários. A chamada de teste Groq não foi feita para não consumir quota.

Rede: `GET /api/agents/` e `GET /api/calendar/` retornaram 200.  
Resultado: PASS no contrato local; quota/Groq real não foi consumida.

### Configurações

Opções: salvar perfil; avatar; nome, sobrenome, e-mail e telefone; salvar empresa; razão social, nome fantasia, CNPJ, telefone, logo; workspace ativo; criar workspace; convidar membro; papel agente/admin; sessões e dispositivos; encerrar sessão; documentos legais; billing condicionado à flag; alterar e-mail, telefone e senha com OTP; atualizar.

Teste executado: carregamento, atualização e leitura dos contratos de perfil, workspaces, segurança e status legal. Operações OTP e encerramento foram inventariadas, não disparadas.

Rede: perfil, workspaces, segurança, legal, empresa, membros, convites, chats e eventos retornaram 200.  
Resultado: PASS.

### ADM Global

Abas/opções: Visão geral, Usuários, Workspaces, Serviços/Integrações, Newsletter, Auditoria e System Admins; atualizar; gestão de usuários/status; membros/convites; integrações e segredos; campanhas, segmentos, consentimento e mídia; auditoria.

Teste executado: autorização `superadmin`, carregamento e atualização da aba Visão geral. Operações destrutivas, envio de newsletter e rotação de segredos não foram disparados.

Rede: `/api/admin/me/` e `/api/admin/overview/` retornaram 200.  
Resultado: PASS.

## Rotas públicas

Login: tema, mostrar/ocultar senha, e-mail, senha, “Lembrar de mim” e entrar.  
Cadastro: tema, Pessoa física/Empresa, nome, sobrenome, e-mail, país, telefone, senha, confirmação, medidor de senha, checkbox legal e links para Termos de uso/Privacidade.  
Recuperação: e-mail e Enviar código.  
Documentos: Termos, Privacidade, Cookies, Uso aceitável e Pagamentos.

As 8 rotas foram abertas em 390×844; todas ficaram sem overflow horizontal, sem erros de console/runtime e com os controles principais visíveis.

## Integridade, truncamento e dados

- `splitNaturalMessage` preserva o conteúdo, quebra em limites naturais e possui teste de regressão para UTF-8/emoji.
- A resposta automática limita cada bloco a 900 caracteres, sem cortar palavra no meio quando há um limite natural.
- Contexto de agente, follow-ups, tags, histórico e próxima agenda são limitados antes de entrar no prompt para evitar sobrecarga e truncamento silencioso.
- Importação de contatos usa lotes, mantém nomes/fotos existentes quando a Evolution omite campos e repara nomes que eram apenas números.
- Mensagens, recibos, presença, fotos e LIDs permanecem escopados por workspace e instância.
- Na auditoria isolada não foi observado truncamento, perda de campos, resposta parcial, timeout ou contaminação entre páginas.

## O que ainda não pode ser declarado como confirmado

1. Entrega realtime da Evolution real, presença, mídia/base64 e fotos de todos os contatos precisam de staging autenticado ou de um preview autorizado.
2. O status remoto da migration do Supabase não foi consultado por este roteiro; a execução foi informada pelo usuário. A migration local de eventos realtime é [`supabase/migrations/20261013160000_calendar_clients_realtime_events.sql`](../supabase/migrations/20261013160000_calendar_clients_realtime_events.sql).
3. Nenhuma mensagem real foi enviada para evitar risco a contatos/grupos.
4. Deploy e variáveis da Vercel não foram alterados nesta auditoria.

## Leitura segura da Evolution realizada nesta sessão

Com as credenciais locais carregadas, foram feitas somente requisições de leitura ao provedor: `GET /instance/fetchInstances` respondeu 200 e retornou uma instância; `POST /chat/findContacts/:instance` respondeu 200 com 2.378 contatos, 2.227 identidades com nome e 517 URLs de foto. Não houve envio, QR, alteração de estado ou webhook. Isso confirma que a Evolution está acessível e entrega metadados, mas fotos não são garantidas para 100% dos contatos; o backfill do Inbox continua necessário para os registros sem foto.

## Diagnóstico final

Não há, no código local auditado, um bug reproduzido de truncamento, rede, timeout ou erro de console. O erro de “Maximum update depth” registrado no primeiro roteiro era efeito do reaproveitamento de uma única página entre áreas; ao repetir em contexto novo por página, desapareceu e não foi acompanhado de `pageerror`. O próximo passo seguro é executar o mesmo roteiro contra um Preview com Supabase staging e Evolution de teste isolados, mantendo envio automático e grupos desabilitados.
