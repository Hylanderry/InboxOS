# InboxOS — Estado Supabase vivo em 27/09/2026

Projeto confirmado: `Inbox OS` — `aczstooavclxhmgtsobg`.

## Regras de reconciliação

- Não executar `db reset` no projeto vivo.
- Não reaplicar migrations cujo versionamento já aparece em `supabase_migrations.schema_migrations`.
- O deploy Netlify desta release aponta para o banco vivo já migrado.
- O diretório local ainda não contém o SQL histórico exato de todas as migrations de 25–26/09. Isso afeta reprodutibilidade de um banco novo, não o schema do projeto vivo atual. A recuperação integral do histórico continua separada da publicação do frontend/server runtime.

## Migrations Auth/multi-tenant presentes no vivo

- `20260925213517 auth_multitenant_foundation_tables`
- `20260925213537 auth_multitenant_foundation_functions`
- `20260925213607 seed_legal_documents_v1`
- `20260925213944 profile_media_bucket`
- `20260925220710 auth_multitenant_advisor_hardening`
- `20260925221107 workspace_invitation_provisioning`
- `20260925221908 whatsapp_instance_global_identity`
- `20260925222231 active_membership_rls`
- `20260925222739 persist_message_instance_context`
- `20260925234924 user_device_multiactor_identity`
- `20260926011950 atomic_email_challenge_claim`
- `20260926020203 claim_email_challenge_atomic`
- `20260926114044 auth_multitenant_production_reconcile`
- `20260926124500 tenant_instance_relational_guards`
- `20260926124521 tenant_guard_advisor_cleanup`
- `20260926154134 auth_user_email_lookup_service`
- `20260926155551 restore_global_evolution_instance_identity`
- `20260927102921 drop_duplicate_whatsapp_instance_name_index`

## Migration aplicada nesta finalização

`20260927102921 drop_duplicate_whatsapp_instance_name_index`

```sql
drop index if exists public.idx_whatsapp_instances_global_name;
```

O índice mantido é `whatsapp_instances_evolution_name_unique`, também UNIQUE em `instance_name`. O Performance Advisor deixou de apontar `duplicate_index` depois da migration.

## Advisors

- Security Advisor: **0 lints** na verificação executada.
- Performance Advisor: sem `duplicate_index` após a migration acima.
- Permanecem avisos `unused_index` de nível informativo. Nenhum deles foi removido automaticamente porque ausência de uso observada não prova que o índice é dispensável.

## Teste adversarial Tenant A × Tenant B

Foram criados fixtures sintéticos e descartáveis no banco vivo para dois usuários/workspaces distintos.

Visibilidade com JWT context do Tenant A:

- workspace A: 1
- workspace B: 0
- instance A: 1
- instance B: 0
- chat A: 1
- chat B: 0
- message A: 1
- message B: 0

Visibilidade com JWT context do Tenant B foi o inverso: B enxergou apenas B e não enxergou recursos A.

Depois do teste, os fixtures foram removidos e a verificação final retornou:

- usuários sintéticos: 0
- workspaces sintéticos: 0
- instâncias sintéticas: 0
- chats sintéticos: 0
- mensagens sintéticas: 0

O teste também revelou que a limpeza de workspace precisa respeitar a ordem de filhos por causa de `inbox_events`; a limpeza final foi executada na ordem correta.
