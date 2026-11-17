# InboxOS — Fase 8 — Security hardening e handoff para Work

Em 02/10/2026, a versão Fase 8 incorpora: bloqueio de redirecionamento para requisições credenciadas (`src/server/security/credentialed-fetch.ts`), uso da função nas chamadas externas que carregam credenciais, timeouts em fluxos sem limite explícito, e política de retry limitado para Resend transacional preservando a chave de idempotência (`src/server/email/resend-retry-policy.ts`). Os módulos da fase anterior (Evolution/cron, Auth, Admin, Newsletter e multi-tenancy) foram mantidos.

Evidência da execução local antes da entrega: `npm test` com 149/149 testes aprovados; auditoria estática 258 arquivos sem erro de sintaxe, 83 rotas e 0 imports internos ausentes; **6 divergências no lockfile** (não homologado). NPM registry/instalação/lint/tsc completo/Vite build/E2E com serviços vivos ainda dependem de ambiente disponível. Nenhum deploy ou migration ao vivo foi executado.

**Documento único para Work:** `docs/WORK_HANDOFF_EXAUSTIVO_FASE8_2026-10-02.md`, com todos os procedimentos e critérios de aprovação para E0–E6. Não reler arquivos históricos sem falha concreta.
