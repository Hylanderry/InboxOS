# Prompt pronto para ChatGPT Work — InboxOS Fase 5

Use **exclusivamente** o ZIP `inboxos-fase5-evolution-hardening-2026-10-02.zip` como base canônica e siga o documento `INBOXOS_HANDOFF_WORK_FASE5_2026-10-02.md` anexo.

Execute as etapas E0–E6 sem parar no planejamento: resolva e regenere o lockfile npm com integridades verdadeiras; instale dependências; corrija ESLint, TypeScript, build e adaptador Netlify; crie staging isolado; valide Supabase, multi-tenancy, auth, APIs e provedores; implemente e teste o **reprocessamento periódico** da fila Evolution (jobs `queued`, `failed`, `processing` obsoleto, retries, dead-letter e deduplicação sob concorrência), e não só o HMAC recém-adicionado. Teste envio/recebimento apenas com números e contatos consentidos de homologação; valide QR, media, Groq, Resend, newsletter e workflow. Publique Deploy Preview de testes, teste o painel ADM/mobile e produza evidências.

Para cada gate entregue **PASS/FAIL/BLOCKED com evidência**, commit/diff/log sanitizado e ação de desbloqueio. Preserve segurança, Billing OFF e o design atual. NÃO faça `db reset`, não escreva no Supabase vivo, não envie a clientes reais nem publique produção sem minha aprovação explícita. Entregue ZIP completo atualizado, patch, relatório final e checklist de rollback. Não declare pronto para produção enquanto faltar um gate bloqueador.
