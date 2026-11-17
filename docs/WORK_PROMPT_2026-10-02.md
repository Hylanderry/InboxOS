# Instrução pronta para o ChatGPT Work

Use o arquivo `inboxos-fase4-work-handoff-2026-10-02.zip` e leia `docs/WORK_HANDOFF_PRODUCAO_2026-10-02.md` integralmente antes de modificar o projeto.

**Execute**, não apenas planeje, a finalização para produção do InboxOS. Resolva `package-lock.json` com npm oficial, execute `npm ci`, testes, ESLint, typecheck e build TanStack/Netlify; corrija todos os problemas reproduzidos sem esconder erros. Depois, siga E2–E6 do handoff: staging Supabase isolado, migrations e isolamento multi-tenant, contratos HTTP e OTP, Evolution/Groq/Resend/Newsletter, Deploy Preview/mobile e checklist de lançamento. Preserve o Billing desligado e funcionalidades existentes. Faça patches pequenos, teste após cada alteração e registre PASS/FAIL/BLOCKED e evidências em `docs/QA_EVIDENCIAS_RELEASE.md`.

Se faltar acesso a GitHub/Netlify/Supabase/credenciais de testes, marque o bloqueio com detalhes específicos e continue o restante. Não aplique alterações ao banco de produção, não envie mensagens reais nem faça deploy de produção sem minha aprovação explícita. Entregue ZIP completo, patch, relatório e gates demonstráveis. Não declare production-ready enquanto persistirem bloqueadores.
