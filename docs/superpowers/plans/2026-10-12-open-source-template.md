# InboxOS Open Source Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produzir uma cópia pública limpa do InboxOS em `C:\Users\DedSec\Desktop\INBOX OS - OPEN SOURCE`.

**Architecture:** A distribuição será uma cópia independente do workspace atual, filtrada por allowlist para preservar aplicação/configuração/testes essenciais e excluir ambientes, artefatos, evidências privadas e scripts operacionais perigosos. A documentação pública explicará dependências e integrações sem incluir credenciais ou referências privadas.

**Tech Stack:** Node.js >=22.12, npm 10.9.2, Vite, TanStack Start, React, Supabase, Evolution API opcional, Netlify/Vercel opcional.

**Spec:** `docs/superpowers/specs/2026-10-12-open-source-template-design.md`

## Global Constraints

- Não alterar a pasta original enquanto a cópia é montada.
- Não copiar qualquer arquivo `.env*`, `.dev.vars`, `.vercel`, `.netlify`, `.tanstack`, `dist`, `node_modules` ou artefato de QA.
- Não incluir segredos, PII, project refs, aliases privados ou dados de clientes.
- Billing permanece `ENABLE_BILLING=false` e `VITE_ENABLE_BILLING=false`.
- Não executar migrations, chamadas Evolution ou deploy durante a preparação.

## Review Focus

- Segredo em arquivo ignorado ou documentação: varredura por nomes/valores proibidos antes da entrega.
- Dependência de arquivo excluído: instalação e build devem funcionar somente na cópia.
- Scripts perigosos exportados: apenas gates e diagnósticos read-only devem permanecer.
- README incompleto: todas as variáveis e comandos devem estar documentados.
- Licença incorreta: `LICENSE` deve conter MIT e `Ackley Studios by Trax Company`.

### Task 1: Montar cópia limpa

**Files:**
- Create: `C:\Users\DedSec\Desktop\INBOX OS - OPEN SOURCE\...`

- [ ] Copiar somente arquivos permitidos conforme a especificação, excluindo segredos, artefatos e documentos privados.
- [ ] Remover da cópia scripts one-off de backfill, sincronização e inspeção real.
- [ ] Confirmar que a pasta original não foi modificada pela operação de cópia.

### Task 2: Preparar metadados públicos

**Files:**
- Create: `.env.example`, `LICENSE`, `.gitignore`, `CONTRIBUTING.md`, `SECURITY.md`
- Modify: `package.json`, `README.md`

- [ ] Tornar `package.json` público e ajustar descrição para template open source.
- [ ] Criar MIT com copyright `Ackley Studios by Trax Company`.
- [ ] Documentar variáveis públicas/server-side, instalação, banco, Evolution staging, testes, build e deploy.
- [ ] Adicionar política de contribuições e reporte de vulnerabilidades.

### Task 3: Sanitizar documentação e referências

- [ ] Remover referências a project refs, aliases Vercel, instâncias, telefones, tokens e ambientes privados da cópia.
- [ ] Garantir que o README não instruirá envio de mensagens para contatos reais.
- [ ] Garantir que Billing permaneça desativado no exemplo.

### Task 4: Validar a distribuição

- [ ] Rodar busca de segredos/PII e confirmar zero ocorrências relevantes.
- [ ] Rodar `npm ci --ignore-scripts --no-audit --no-fund` na cópia.
- [ ] Rodar `npm test`, `npm run lint`, `npx --no-install tsc --noEmit` e `npm run build` na cópia.
- [ ] Entregar resumo dos arquivos preservados/excluídos e limitações de serviços externos.
