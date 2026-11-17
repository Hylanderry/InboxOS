---
trigger: model_decision
description: "Aplicar a migrações Supabase, schema SQL, RLS, auth, queries, restore, backups e jobs de reprocessamento."
---
# Regras de segurança do banco

- **Nunca** usar o project ref de produção `bopdgnmifuohuoftjexs` como ambiente de homologação. Não rodar DDL/DML no banco de produção sem autorização explícita e plano de rollback.
- Preferir `SELECT` de catálogo e contagens para diagnósticos; não extrair payloads, mensagens pessoais ou telefones para relatórios.
- Manter RLS para todos os tenants. `service_role` somente no servidor; `user_metadata` não serve para autorização; rever funções SECURITY DEFINER e permissões de EXECUTE.
- Testar casos concorrentes de alteração do último owner/superadmin em staging; não supor que migration local já está aplicada.
- Confirme origem, constraints e chaves estrangeiras atuais antes de aplicar `onConflict` ou migração.
- Não reprocessar eventos mortos indiscriminadamente: primeiro correção publicada, diagnóstico, canário autorizado e monitoramento.
