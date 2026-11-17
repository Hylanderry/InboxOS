# InboxOS — Supabase final state — 30/09/2026

Projeto vivo: `aczstooavclxhmgtsobg`.

## Advisors

- Security Advisor: **0 lints**.
- Performance Advisor: somente `unused_index` em nível INFO.
- O warning novo de FK sem índice foi resolvido por `20260930160052 workspace_product_owner_index`.

## Guards de produto

- CRM stage/chat/contact protegidos por referências compostas com workspace.
- Follow-up lead/chat protegidos por referências compostas com workspace.
- Agent/instance/run protegidos por referências compostas com workspace.
- `owner_user_id` de lead/follow-up referencia membership do mesmo workspace.
- Auto-agent tem unicidade por escopo e run tem unicidade por `agent + trigger_message`.
- IDs externos de billing têm unicidade por provedor.
- Tabelas de produto não concedem acesso direto a `anon`/`authenticated`; acesso é mediado pelo backend.

## Testes adversariais executados

1. Workspace A usando stage B: bloqueado.
2. Dois agentes automáticos no mesmo escopo: bloqueado.
3. Customer de billing duplicado no mesmo provider: bloqueado.
4. Lead A com owner membro somente de B: bloqueado.
5. Follow-up A com owner membro somente de B: bloqueado.
6. Fixtures de todos os testes removidos; residual confirmado em zero.

## Últimas migrations

- `20260929011845 workspace_product_modules`
- `20260929013234 workspace_product_relational_guards`
- `20260929013310 workspace_product_fk_indexes`
- `20260929014139 workspace_product_runtime_guards`
- `20260930155753 workspace_product_owner_guards`
- `20260930160052 workspace_product_owner_index`

O deploy atual deve usar este projeto vivo. O histórico mais antigo de 14–26/09 ainda deve ser reconciliado localmente por exportação exata, sem reset/replay destrutivo em produção.
