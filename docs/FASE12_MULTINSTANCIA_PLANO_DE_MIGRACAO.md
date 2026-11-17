# Fase 12 · G2-03/G2-04 — Mensagens multi-instância: diagnóstico e migração planejada

**Status:** projeto e consultas preparados **offline**; **NÃO EXECUTADO** em Supabase. Não existe migration nova aplicável neste pacote. Sem autorização para `db push`, `db reset`, `migration repair` ou reprocessar backlog vivo.

## Diagnóstico baseado no repositório

- A migration `20260906120000_multi_tenant_workspaces.sql` cria `idx_messages_workspace_external` para `(workspace_id, external_id) WHERE external_id IS NOT NULL`.
- `20260906155548_add_messages_unique_constraint.sql` acrescenta `messages_workspace_external_key UNIQUE (workspace_id, external_id)`.
- A RPC `persist_inbox_message` em `20260917210000_reconcile_inbox_architecture.sql` procura registros por `workspace_id,external_id` **sem** `instance_id` (e procura `client_message_id` por workspace); o wrapper `persistMessage` em `src/lib/evolution.server.ts` também faz pré-checagem somente por workspace + external_id.
- Sincronização histórica já filtra `workspace_id + instance_id` na busca de existentes, porém uma inserção ainda pode colidir com a UNIQUE no banco. **Não basta corrigir uma query isolada.**
- A Fase 12 reforçou as mutações de edição, exclusão e reação para que **sempre** requeiram `instance_id`. Também restringiu a atualização de foto e de metadados do remetente na sincronização. Essas correções **não eliminam a unicidade antiga**.

## Diagnóstico somente leitura no banco de staging

1. Conferir o project ref do staging; jamais usar produção como substituto. Inspecionar `scripts/sql/inspect-message-identity-readonly.sql` antes da execução.
2. Verificar o schema real (colunas, FKs, índices/constraints, overloads de RPC, funções e políticas existentes). **Não pressupor que as migrations antigas correspondem ao schema vivo.**
3. Agregar `missing_instance_id`, `mismatched_workspace`, `mismatched_instance` e duplicatas por `(workspace_id,instance_id,external_id)`; sanar registros legados apenas com plano de reversão aprovado.
4. Confrontar a origem dos `external_id` em duas instâncias Evolution sandbox. O índice antigo impede armazenar o segundo registro quando o ID colide; logo, **contagem zero de colisões na tabela não prova ausência de colisões na origem**.
5. Confirmar separadamente a semântica e os índices de `client_message_id`, inclusive outbox e idempotência de envio. Não eliminar a proteção de idempotência global/por workspace antes de determinar seu uso real.

## Desenho de migração para staging — NÃO IMPLEMENTAR ATÉ PASSAR G2-01/03

- Pré-requisitos: backup restaurável comprovado, relatório de constraints reais, decisão sobre nulls legados e checagem de referências downstream (mídia, chat, outbox, recibos, quoted messages e triggers), além de janela de implantação de teste.
- Garantir `instance_id` determinístico por mensagem usando relação comprovada com `chats`/`whatsapp_instances`. **Não** preencher nulls por default arbitrário. Rejeitar transição se houver ambiguidades.
- Em uma **migration versionada, transacional e revisada**, preparar o índice/constraint por `(workspace_id,instance_id,external_id)` para `external_id IS NOT NULL`; definir estratégia distinta para `client_message_id` após teste de semântica; remover/renomear antigos índices exclusivos **somente na mesma mudança coordenada da RPC e queries**. Não colocar duas UNIQUE incompatíveis ativas esperando que a nova resolva a colisão.
- Atualizar a RPC `persist_inbox_message` sem mudar sua interface pública sem análise de consumidores: localizar `v_instance_id` validado e consultar `messages` por `(workspace_id,instance_id,external_id)`, mantendo o lock/advisory e incrementando `unread` uma única vez. Revisar tratamento de corrida no `INSERT` (índice único e retry/ON CONFLICT realmente coerentes).
- Atualizar `persistMessage` e todos os leitores por `external_id` para exigir escopo da instância; conferir paths de dedup, mutations, histórico, mídia, reactions, receipts e sincronização, além de RLS.
- Efetuar backfill de inconsistências **apenas em staging com fixture**, então executar testes de concorrência de duas instâncias do mesmo workspace com mesmo `external_id`, mensagem repetida na mesma instância, outros workspaces, chat/media de outra instância e `client_message_id` repetido. Mensagem B não pode substituir/editar A; duplicata A não deve incrementar `unread`.
- Para rollback, documentar comportamento reversível de código e banco. Se dados com mesmo `(workspace_id,external_id)` passarem a existir nas duas instâncias, **não é seguro restaurar a UNIQUE antiga** sem política explícita de reconciliação/perda de dados (que exige aprovação separada). Preferir roll-forward compatível, snapshot pré-deploy e plano de restauração testado.

## Critérios de PASS

1. Constraints e funções **reais** registradas em staging e diagnóstico agregador sem inconsistências não resolvidas.
2. Migration aplicada apenas em staging, com consistência transacional e deploy de código compatível.
3. Mesma ID externa em instâncias A e B gera duas mensagens independentes; repetição na instância A não gera terceira; `unread`, chat e mídia ficam no dono correto.
4. Corrida webhook + sync + outbox reprocessada sem mensagens duplicadas nem perda silenciosa; RLS/IDOR negativos cobrindo duas empresas.
5. Restore/reversão ou roll-forward ensaiado; nenhum deploy/backfill em produção antes dos gates.

**Situação real:** G2-03 e G2-04 permanecem **BLOCKED/NOT RUN** para E2E e migration; esta documentação não é prova de migração aplicada.
