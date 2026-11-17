# InboxOS — Calendário, Clientes e Contexto de Agentes

## Objetivo

Criar um fluxo único para importar clientes do WhatsApp/CRM, organizar tags,
agendar e remarcar atendimentos com controle de capacidade e permitir que o
agente de IA use somente o contexto autorizado de cliente, follow-ups e agenda.
O Inbox continua sendo a superfície de execução: handoff humano, presença
digitando e entrega de mensagens permanecem auditáveis e idempotentes.

## Regras funcionais

- Cada workspace tem um calendário padrão opcional, fuso IANA, duração padrão,
  intervalo entre reservas, limite diário e janelas de disponibilidade.
- Um agendamento pertence ao workspace e pode referenciar lead, chat e agente.
  Status válidos: `scheduled`, `confirmed`, `completed`, `canceled`, `no_show`.
- A criação/remarcação rejeita conflito sobreposto, dia fora da disponibilidade
  e limite diário; cancelamento libera a capacidade. Todas as mutações são
  restritas ao workspace autenticado.
- Clientes são os `crm_leads` enriquecidos por `whatsapp_contacts`; importação
  é idempotente por telefone/chat. Tags são catálogo por workspace e relação N:N
  com leads, permitindo seleção e atribuição em massa.
- O agente só consulta ou modifica agenda quando as permissões explícitas do
  `runtime_config` estiverem habilitadas. Follow-ups pendentes, tags e próximo
  agendamento entram em contexto limitado ao cliente/chat atual.
- Durante uma resposta automática, a Evolution recebe `composing`; o estado é
  encerrado antes do envio. O tempo é estimado por caracteres, limitado a uma
  janela humana curta e sem bloquear a função além do timeout da requisição.
- Respostas longas são divididas em frases/parágrafos e, só então, palavras;
  nenhum chunk termina no meio de palavra, surrogate pair ou bloco de código.
- Groq usa teto central de tokens, timeout, concorrência por workspace e cache
  curto por agente+contexto; falhas não disparam retries ilimitados nem enviam
  mensagem duplicada.

## Dados e APIs

Novas tabelas: `calendar_calendars`, `calendar_appointments`,
`crm_tags`, `crm_lead_tags`. Todas têm `workspace_id`, RLS e índices por
workspace/data. As APIs seguem `/api/calendar`, `/api/clients` e
`/api/agents`, mantendo `crm_leads` como fonte canônica de clientes.

## UI/UX

Adicionar navegação `Calendário` e `Clientes`. O calendário tem visão mensal,
lista diária, contador de capacidade, filtros por agente/status/tag e modal de
criação/edição. Clientes têm busca, filtro salvo/potencial lead, importação CSV
com prévia, seleção em massa e criação/atribuição de tags. A edição de agente
ganha opções de calendário/contexto. Todos os controles usam tokens existentes,
Phosphor, escala 4/8/12/16/24, estados claro/escuro e alvos de toque de 44px.

## Segurança e observabilidade

Não há envio real durante QA. Ações automáticas registram `automation_agent_runs`
e falhas de agenda retornam erro explícito para o handoff. O diagrama de fluxo é
mantido em `docs/diagrams/calendar-client-agent-context.mmd`.

