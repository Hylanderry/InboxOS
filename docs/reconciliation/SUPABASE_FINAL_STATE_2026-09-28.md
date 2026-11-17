# InboxOS — Estado final do Supabase

Data local da revisão: 28/09/2026.
Projeto vivo: `aczstooavclxhmgtsobg`.

## Advisors

- Security Advisor: **0 lints** na verificação final.
- Performance Advisor: somente avisos `unused_index` em nível INFO. Não há `duplicate_index` nem `unindexed_foreign_keys` pendentes após as migrations desta entrega.

## Migrations desta finalização

Aplicadas no banco vivo e materializadas localmente com o mesmo version/name:

- `20260927102921_drop_duplicate_whatsapp_instance_name_index.sql`
- `20260929011845_workspace_product_modules.sql`
- `20260929013234_workspace_product_relational_guards.sql`
- `20260929013310_workspace_product_fk_indexes.sql`
- `20260929014139_workspace_product_runtime_guards.sql`

Os módulos adicionados são `crm_stages`, `crm_leads`, `follow_up_tasks`, `automation_agents`, `automation_agent_runs` e `workspace_billing`. Todos têm RLS habilitado; `anon` e `authenticated` não recebem acesso direto e o backend opera com service role somente depois de autorizar workspace/role.

## Guards multi-tenant adicionados

- lead -> stage/chat/contact do mesmo workspace;
- follow-up -> lead/chat do mesmo workspace;
- agent -> instance do mesmo workspace;
- agent run -> agent/chat/trigger message do mesmo workspace;
- uma execução por `agent_id + trigger_message_id` para impedir auto-reply duplicado;
- no máximo um agente automático global por workspace e um por conexão;
- IDs externos de billing únicos por provider quando presentes.

## Histórico antigo ainda não materializado bit a bit

O projeto vivo possui migrations históricas de 14–26/09 cujo SQL/timestamp exato ainda não está integralmente materializado no diretório local herdado. Isso **não bloqueia a aplicação contra o projeto Supabase vivo atual**, mas significa que este repositório não deve ser tratado como fonte suficiente para executar `supabase db reset` e reconstruir um projeto novo bit a bit.

Não tentar corrigir isso renomeando/reaplicando migrations antigas no banco vivo. A reconciliação futura correta é exportar o conteúdo de `supabase_migrations.schema_migrations`, materializar os arquivos históricos exatos e comparar uma instância nova antes de qualquer uso de `db reset/db push` em outro projeto.

## Teste adversarial dos módulos novos

Executado contra o projeto vivo com fixtures descartáveis e limpeza no mesmo fluxo:

- `workspace A + stage B` em `crm_leads`: bloqueado por FK composta;
- segundo agente `automatic` global no mesmo workspace: bloqueado por unique parcial;
- mesmo `provider + external_customer_id` em dois workspaces: bloqueado;
- grants diretos de `anon/authenticated` nas seis tabelas novas: **0**;
- workspaces de fixture após a limpeza: **0**.
