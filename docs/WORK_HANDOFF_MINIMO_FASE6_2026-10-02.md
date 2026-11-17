# InboxOS — Handoff MÍNIMO para ChatGPT Work (economizar créditos)

**Código-base único:** `inboxos-fase6-recovery-2026-10-02.zip`. **Não usar ZIP anterior**, não reescrever o projeto. **Data:** 02/10/2026.

## Leitura inicial (sem pesquisa redundante)

O InboxOS é SaaS multi-tenant React 19 + TanStack Start + TypeScript + Vite + Netlify + Supabase + Evolution API + Groq + Resend. Possui inbox/CRM/follow-up, agentes de IA, ADM global, newsletter e RBAC. Billing **OFF** por contrato (`ENABLE_BILLING=false`, `VITE_ENABLE_BILLING=false`), idioma adicional fora de escopo. Admin global não é admin de workspace.

Já entregues/cobertos por **135 testes locais**: autenticação/OTP e políticas, criptografia do cofre (`INTEGRATION_VAULT_KEY`, não as chaves de versões antigas), hardening HMAC/webhook, fila com CAS, recovery agendado (Fase 6), assinatura da função background com validade, limitação de chamadas, auditoria estática de imports/rotas, controles de deploy. **Não reimplementar isso**, salvo falha reproduzida.

Antes de qualquer ação, leia **somente** `docs/FASE6_EVOLUTION_RECOVERY_2026-10-02.md`, `docs/QA_EVIDENCIAS_RELEASE.md`, `scripts/prepare-production-build.sh`, `netlify.toml`, `package.json`, e os arquivos indicados diretamente por erros reais. Arquivos históricos em docs/ são para consulta específica, não recapitular todo o projeto. Faça alterações pequenas e testadas; anexe evidências compactas.

## Tarefas RESTANTES QUE NÃO FORAM POSSÍVEIS AQUI

### BLOQUEIO 1 — Corrigir npm/lockfile e aprovar build (P0)

Num executor Node 22.16.0 / npm 10.9.2 **com acesso ao registry** rode uma única vez:

```bash
bash scripts/prepare-production-build.sh
```

Esse script regenera lockfile pelo npm, executa `npm ci`, testes, auditoria, ESLint, TypeScript e Vite build. Aqui npm falha `EAI_AGAIN` / `ENOTCACHED` para `@netlify/vite-plugin-tanstack-start@1.3.19`; o lock tem seis divergências (duas referentes a esse adaptador e quatro dependências antigas). **Não inventar hashes e não desabilitar gates**. Se um comando falhar, corrigir exatamente seus diagnósticos, repetir até PASS e registrar o diff do lock. Verificar adapter TanStack/Netlify após gerar artefatos. Resultado esperado `npm ci + npm test + npm run audit:release + lint + tsc + build` todos 0 no mesmo commit. **Se não conseguir acesso ao registry, não repetir tentativas inúteis.**

### BLOQUEIO 2 — Validar banco isolado e fila real (P0)

Em projeto Supabase STAGING separado, com credenciais e dados **sintéticos**, reconciliar migrations legadas antes de aplicar quaisquer SQL (não `db reset`/`db push` no vivo). Validar especialmente `supabase/migrations/20261001230000_protect_last_privileged_members.sql` e a migração de transferência owner já existente no histórico do banco vivo; RLS com dois tenants, último owner/admin, sessões revogadas.

Validar `evolution_events` com dois workers simultâneos; status `queued`, `failed`, `processing` expirado e `dead_letter`; reentrega após falha do HTTP/background; limite de tentativas e idempotência de mensagens/IA. Publicar um **site STAGING separado** com Scheduled Function e executar **Run now** da função `evolution-recover`, pois Deploy Preview não executa scheduled automaticamente. A execução só deve ser ativada com `ENABLE_EVOLUTION_RECOVERY=true` no staging. Não colocar credenciais reais em logs e não consumir contatos reais. Os testes mock locais não substituem estes testes.

### BLOQUEIO 3 — Homologação HTTP/provedores e interface (P0/P1)

Com Deploy Preview isolado, validar API/auth 401/403/409/429/503, OTP, RBAC/admin, convites, sessão revogada, dois workspaces; Evolution QR/webhooks/mídia, agentes Groq, Resend OTP/newsletter somente com destinatário autorizado, filas e 5xx. Usar contas/números sandbox. Executar `.github/workflows/staging-smoke.yml` e `npm run test:integration` com `TEST_BASE_URL` do preview, completar testes browser mobile 320/360/390 px, desktop, navegação e formulários. Fazer revisão de console/logs. Exigir registro PASS/FAIL/BLOCKED com evidências por fluxo; não declarar homologação por parser ou teste unitário.

### BLOQUEIO 4 — Aprovação de lançamento (P0)

Depois que 1–3 passarem, documentar plano de backup/rollback, CI/monitoramento e validar as ENV de produção com `npm run audit:env`. `ENABLE_EVOLUTION_RECOVERY=true` é exigido pelo gate **após homologação**; Billing deve permanecer OFF, `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` vazio após bootstrap; chave de cofre e service_role permanecem só no servidor. Antes de DDL no banco vivo, enviar email/WhatsApp reais, mudar credenciais/webhooks ou promover à produção, **solicitar aprovação explícita do proprietário**. Não fazer deploy automático no domínio principal.

## Como gastar o mínimo de créditos do Work

1. **Não crie outra arquitetura/relatório gigante.** Faça primeiro o BLOQUEIO 1; ele normalmente destrava vários gates de uma vez. Não executar pesquisas da Web sem necessidade concreta de erro/API atualizada.
2. Execute comandos em lote e apresente **uma única tabela compacta** PASS/FAIL/BLOCKED por bloco, com exit codes e links dos logs sanitizados. Quando não houver acesso ao serviço, marque BLOCKED uma vez e continue tarefas independentes, sem pedir o mesmo acesso de novo.
3. Inspecione só os arquivos relevantes ao erro; preserve todas as features, supabase multi-tenant, flags de Billing e regras de segurança. Nunca remover testes/gates para fazer build verde.
4. Entregue um ZIP do código **realmente testado**, patch/diff e `docs/QA_EVIDENCIAS_RELEASE.md` atualizado. Só diga *production-ready* com build, E2E, banco, integrações e preview comprovados.
5. **Mínimo de aprovações externas:** pedir uma vez credenciais/acessos de staging e repositório/Netlify se faltarem; separar da autorização final para escrita/deploy no ambiente vivo.

## Estado técnico inicial verificado

- Local: `npm test` **135/135 PASS**. Parser TypeScript **255/255**. Imports internos faltantes **0**. Árvore de rotas **83/83**.
- `npm run audit:release` **FAIL somente no lockfile** (6 inconsistências); `npm ci --offline` **ENOTCACHED**; npm registry normal **EAI_AGAIN**; `npm run build` **vite não instalado**. `lint`/`tsc --noEmit`/build **não aprovados**.
- Supabase live consultado **somente em leitura**: tabela/índices de `evolution_events` coerentes com código e Security Advisor sem alertas na consulta. Nenhuma migration aplicada e nenhum dado modificado.
- Fase 6 adicionou 11 testes novos sobre os 124 anteriores; os testes novos cobrem recuperação/assinaturas em memória e não têm prova de infraestrutura.

## Prompt curto sugerido (não repetir contexto)

> Use o ZIP `inboxos-fase6-recovery-2026-10-02.zip` e o documento `docs/WORK_HANDOFF_MINIMO_FASE6_2026-10-02.md` como instrução única. Faça os quatro bloqueios na ordem, corrigindo o código e executando os testes. Não reconstrua nem reauditе indiscriminadamente as 5 fases anteriores. Gaste o mínimo de ações/créditos: rode o script de build, corrija só erros concretos, agrupe testes e registre evidências. Não toque na produção nem envie mensagens reais sem minha aprovação. Entregue código completo testado e a matriz QA final.
