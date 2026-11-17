# InboxOS — instruções persistentes para o agente Antigravity

## Missão
Finalizar **o InboxOS existente** para homologação e lançamento controlado; corrigir falhas reais, testar e entregar evidências. **Não** reescrever o produto, substituir stack, refazer telas ou criar um projeto novo.

## Base e prioridade das fontes
- Código de referência: `inboxos-evolution-correcoes-2026-10-02.zip` (hotfix Evolution, 02/10/2026), se esta pasta foi originada do ZIP já é a base correta.
- Entrada de execução: `ANTIGRAVITY_COMECE_AQUI.md` e `docs/ANTIGRAVITY_EXECUCAO_RELEASE.md`.
- Incidente: `docs/ANTIGRAVITY_INCIDENTE_EVOLUTION.md`; testes: `docs/ANTIGRAVITY_TESTES_EVOLUTION.md`.
- Relatórios históricos não são fonte de versão; consultá-los somente para entender regressões.
- Divergência entre documentação e código/esquema real: analisar e registrar evidência antes de corrigir; **não** presumir que migrações do ZIP já foram aplicadas.

## Restrições inegociáveis
1. **PRODUÇÃO PROTEGIDA.** Não publicar, alterar schema/RLS/migrations, disparar mensagens para clientes, reconfigurar webhook real, rodar limpeza, backfill ou reprocessar eventos em produção sem autorização explícita, específica e posterior a evidências de staging. Leituras SQL `SELECT` são permitidas quando houver acesso autorizado; evitar revelar dados pessoais.
2. Produção Supabase ativa: `bopdgnmifuohuoftjexs`. O ref histórico `aczstooavclxhmgtsobg` não faz parte deste projeto e não deve ser usado em configuração, deploy ou smoke test. Staging **deve ter outro project ref, credenciais e instância Evolution diferentes**. Se não houver staging, registrar `BLOCKED`, não usar produção no lugar.
3. Billing continua **DESATIVADO** (`ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`). Sem compras, planos, features ou alterações de preços.
4. Segredos só em variáveis de ambiente server-side, nunca em `VITE_`, logs, respostas, screenshots, commits ou artefatos. Nunca imprimir valores reais de keys/tokens, telefones ou mensagens pessoais.
5. Preservar multi-tenancy (`workspace_id` + `instance_id`) e separação de papéis. Nenhuma query nova sem escopo e testes de dois workspaces/instâncias.
6. Não afrouxar ESLint, TypeScript, testes, constraints, RLS, rate limit ou gates de CI para obter sucesso falso.
7. Não repetir disparos da Evolution após timeout/resposta ambígua. Tratar como status desconhecido e reconciliar por `clientMessageId`/ID externo; impedir duplicidade.
8. Não reprocessar filas grandes ou `dead_letter` em lote sem diagnóstico e aprovação. O backlog conhecido é severo e é evidência de **produção ainda não homologada**.
9. Não apagar/alterar dados existentes, nem executar scripts antigos `fix-*`/`sync-*` antes de revisar o código do script e seu alvo.
10. Rotular verificações como `PASS`, `FAIL`, `BLOCKED` e `NOT RUN`. **Teste unitário verde não equivale a build nem E2E real.**

## Stack e comandos principais
Node >=22.12, npm 10.9.2, Vite/TanStack Start, Vercel, Supabase, Evolution API v2, Groq, Resend. Na raiz:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --include=dev --include=optional --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx --no-install tsc --noEmit
npm run build
```

Use `npm run release:check` antes de promover um deploy Vercel. A instalação pode detectar defeitos adicionais não observáveis no ambiente anterior. Corrigi-los sem pular etapas.

## Forma de trabalhar
- Investigar erro reproduzível → aplicar a menor correção segura → teste de regressão → rodar a suíte existente → registrar evidência.
- Preferir trabalho sequencial e conciso. Não criar dezenas de documentos nem chamar outras IAs para repetir auditorias já feitas.
- Atualizar **um único** registro `docs/ANTIGRAVITY_CHECKLIST_RELEASE.md` com status, comandos e evidências, no mesmo commit das mudanças.
- Se faltar acesso, resolver outras etapas independentes antes de pedir ao usuário o acesso exato faltante.
- Exigir autorização explícita do usuário apenas antes de tocar produção, enviar mensagens reais ou executar ações destrutivas/irreversíveis.

## Atualização Fase 14 — skills de manutenção
- Para alterações de UI/UX, aplicar `.agents/skills/inboxos-premium-uiux/SKILL.md` e `.agents/rules/inboxos-uiux-consistency.md`.
- Para backend/build/Vercel/Supabase/Evolution, aplicar `.agents/skills/inboxos-backend-release/SKILL.md` e o handoff `docs/FASE14_HANDOFF_ANTIGRAVITY_CODEX.md`.
- Manter edição de UI separada de migrations e mutações em produção. Exigir evidência antes de marcar gates de release como PASS.

## Checkpoint Fase 15 — fonte de verdade atual (11/10/2026)
- **A versão oficial desta pasta é a FASE 15, não o ZIP antigo citado na missão histórica acima.** Não voltar a fases anteriores nem reaplicar patches antigos sobre F15.
- **LEITURA OBRIGATÓRIA ANTES DE EDITAR:** `ANTIGRAVITY_INICIO_FASE15.md`, `docs/FASE15_HANDOFF_COMPLETO_ANTIGRAVITY_CODEX.md`, `docs/FASE15_REGISTRO_MUDANCAS_UIUX.md`, `.agents/skills/inboxos-premium-uiux/SKILL.md`, `.agents/skills/inboxos-backend-release/SKILL.md`.
- Divisão de trabalho: frontend F15 já corrigido offline; Codex/Antigravity assume G1–G6 e browser QA, sem comprometer a segurança de produção.
- 220/220 testes Node foram aprovados na F15; **lint, typecheck, build, migrations e E2E não estão aprovados**. O status é NO-GO.
- Alterações no frontend devem seguir testes de regressão e evidência visual; alterações no backend devem seguir gates de staging e autorização explícita antes de produção.

## Checkpoint Fase 16 — ATUAL (11/10/2026)
- **Fonte de verdade:** este código da **Fase 16**, derivado diretamente do ZIP F15. Declarações da F15 acima são HISTÓRICAS; nunca rebaixar código ou reaplicar patches F11–F15.
- Ler `ANTIGRAVITY_INICIO_FASE16.md` e `docs/FASE16_MASTER_HANDOFF_ANTIGRAVITY_CODEX.md` integralmente antes de alterar arquivos.
- 233 testes Node aprovados localmente: 220 F15 + 13 novos (3 cenários funcionais puros + 10 testes de contrato de UI/UX). **Sem build, lint, typecheck completo ou E2E aprovado**: seis divergências de lockfile e falta de pacotes.
- Correção CRÍTICA: reconciliação de mensagens de chat antigo não pode alterar o chat visível; manter `chat-scoped-update.ts` e seus testes.
- Modal de perfil, cabeçalho e menu de anexos: manter comportamento de teclado, foco, restauração e Escape.
- Backend e banco: Antigravity/Codex implementa somente com teste e STAGING ISOLADO; preservar API/UI atual e Billing OFF.
- Checklist e matriz visual no documento mestre F16; marcar `PASS` somente com logs/screenshots reais.
