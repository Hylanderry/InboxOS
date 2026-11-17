---
trigger: model_decision
description: "Aplicar ao corrigir Evolution API, webhooks, envio WhatsApp, processamento de eventos, sync, idempotência, outbox e filas."
---
# Regras de confiabilidade Evolution

- Confirmar endpoint/estrutura com a documentação da **versão real** da Evolution v2 instalada, não exemplos genéricos.
- Não enviar mensagem real sem número/instância próprios e autorização; não usar cliente real.
- Conferir `onConflict` contra UNIQUE/PK **real** no PostgreSQL antes de qualquer upsert. Para `whatsapp_contacts` usar `workspace_id,instance_id,remote_jid`; para `whatsapp_presence`, `workspace_id,instance_id,phone` (conforme consulta da produção em 02/10/2026).
- Eventos devem ser deduplicados por chave que mantenha etapas distintas (`DELIVERED`, `READ`) e nunca regredir estado; editar/apagar/reagir sempre escopado por `workspace_id` + `instance_id`.
- Envio com `clientMessageId`: proteção concorrente de reserva, resultados ambíguos sem retry cego, aceitação registrada antes de operações locais que possam falhar; reconciliar.
- HTTP 2xx do webhook apenas confirma recebimento/enfileiramento, não conclusão. Validar status em `evolution_events` e efeitos em contatos/chats/mensagens após o worker.
- Recusar redirecionamentos com credentials; usar timeout, retries limitados e assinatura HMAC para workers internos.
- Ver detalhes em `docs/ANTIGRAVITY_TESTES_EVOLUTION.md` e backlog em `docs/ANTIGRAVITY_INCIDENTE_EVOLUTION.md`.
