# InboxOS — Reconciliação Supabase vivo × checkpoint local

Projeto vivo confirmado: `Inbox OS` (`aczstooavclxhmgtsobg`). Não executar `db reset`, não renomear nem reaplicar migrations já aplicadas. O antigo `supabase/.temp/linked-project.json` apontava para outro projeto e foi removido/ignorado.

O banco vivo possui a fundação Auth/multi-tenant de 25–26/09 que não existe integralmente neste checkpoint local. Antes de criar novas migrations, recuperar e materializar o DDL exato das migrations já aplicadas e regenerar os tipos Supabase.

Migrations Auth/multi-tenant confirmadas no vivo:
- 20260925213517 auth_multitenant_foundation_tables
- 20260925213537 auth_multitenant_foundation_functions
- 20260925213607 seed_legal_documents_v1
- 20260925213944 profile_media_bucket
- 20260925220710 auth_multitenant_advisor_hardening
- 20260925221107 workspace_invitation_provisioning
- 20260925221908 whatsapp_instance_global_identity
- 20260925222231 active_membership_rls
- 20260925222739 persist_message_instance_context
- 20260925234924 user_device_multiactor_identity
- 20260926011950 atomic_email_challenge_claim
- 20260926020203 claim_email_challenge_atomic
- 20260926114044 auth_multitenant_production_reconcile
- 20260926124500 tenant_instance_relational_guards
- 20260926124521 tenant_guard_advisor_cleanup
- 20260926154134 auth_user_email_lookup_service
- 20260926155551 restore_global_evolution_instance_identity

Security Advisor observado: 0 lints. Performance Advisor: warning de índice duplicado em `whatsapp_instances`; não remover sem migration específica e validação de callers/constraints.
