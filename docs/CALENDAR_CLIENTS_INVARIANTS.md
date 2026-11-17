# InboxOS — invariantes de segurança e contrato

Este arquivo é a lista de coisas que não podem quebrar durante a próxima geração.

## Nunca fazer

- Nunca misturar dados entre `workspace_id`, instância, conversa ou cliente.
- Nunca remover mensagens, contatos, leads, follow-ups ou fotos existentes durante a sincronização.
- Nunca usar fallback para outro workspace, outro projeto Supabase ou outra instância.
- Nunca enviar mensagem de QA para grupo ou para um número aleatório de produção.
- Nunca registrar token, chave, telefone completo, e-mail ou conteúdo sensível em logs.
- Nunca marcar uma mensagem como entregue/aceita antes do recibo da Evolution.
- Nunca permitir que um agente automático responda depois de um handoff humano (`chats.ai_paused = true`).
- Nunca deixar a fila do Groq crescer sem limite; saturação deve falhar de forma segura e ser observável.
- Nunca aplicar uma alteração de schema diretamente em produção sem migration revisada e smoke test isolado.

## Contratos que permanecem

- As rotas existentes e os formatos de resposta continuam compatíveis; novos campos são aditivos.
- `GET /api/crm/` continua retornando `stages`, `leads` e `canManage`.
- `GET /api/follow-up/` continua retornando `tasks` e `canManage`.
- `GET /api/agents/` continua retornando `agents`, `instances`, `runs` e `groqConfigured`.
- O webhook Evolution continua idempotente: o mesmo evento não cria mensagem/outbox duplicado.
- Todas as mutações continuam exigindo sessão, permissão e escopo explícitos.
- O calendário considera somente `scheduled` e `confirmed` na capacidade; cancelados não ocupam vaga.
- O agente recebe somente follow-ups, tags e próximo agendamento do cliente/conversa atual.
- A resposta do agente preserva todo o texto ao dividir mensagens e nunca corta no meio de uma palavra quando houver uma fronteira natural.
- Ações de agenda do agente só são executadas por uma diretiva estrita, no workspace/chat/lead atual e com permissão explícita; diretivas inválidas são descartadas.
- A presença `composing` é encerrada em sucesso, erro, timeout ou handoff.

## Retornos padrão

- Lista vazia, quando não há registros: `[]`, nunca `null`.
- Campo opcional sem valor: `null` (não string vazia), salvo no contrato de formulário.
- Falha de rede: HTTP não-2xx com `{ "error": "..." }`, sem stack trace ou segredo.
- Sincronização parcial: preserva dados já existentes e registra erro sanitizado para observabilidade.
- Avatar ausente: `profilePicUrl: null`; a UI usa o fallback de iniciais sem bloquear o carregamento.

## Pontos de aplicação obrigatória

1. Aplicar `supabase/migrations/20261013143000_calendar_clients_agent_context.sql` no staging.
2. Confirmar que as tabelas novas estão em RLS e acessíveis somente pelo `service_role` dos handlers.
3. Verificar webhook Evolution, Realtime e filas antes de promover o deploy.
4. Rodar testes locais, build, lint e `audit:release` antes de publicar.
