# InboxOS Open Source Template — Design

## Objetivo

Criar uma cópia pública e independente do InboxOS em `C:\Users\DedSec\Desktop\INBOX OS - OPEN SOURCE`, pronta para ser publicada no GitHub sob a licença MIT, sem segredos, dados reais, artefatos de ambiente ou scripts operacionais de manutenção.

## Escopo

- Preservar o código de aplicação, assets públicos, migrações versionadas, configurações de build e testes de regressão necessários.
- Remover credenciais, ambientes locais, artefatos de build, evidências de QA com dados privados, aliases/projetos privados e scripts one-off que fazem backfill ou mutações fora do fluxo da aplicação.
- Tornar o pacote público (`private: false`) e documentar instalação, variáveis, banco, Evolution em staging, testes, build e deploy.
- Adicionar `LICENSE` MIT com copyright `Ackley Studios by Trax Company`, `.env.example`, `CONTRIBUTING.md`, `SECURITY.md` e `.gitignore` público.

## Regras de segurança

- Nenhum valor real de `.env*`, token, telefone, mensagem, project ref, URL privada ou identidade de cliente entra na cópia.
- A cópia não executa migrations, chamadas Evolution ou deploy; apenas prepara arquivos para uso pelo mantenedor.
- Billing permanece explicitamente desativado no template.
- Scripts perigosos de backfill/sincronização ficam fora da distribuição pública.

## Conteúdo preservado

- `src/`, `public/`, `supabase/migrations/`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `netlify.toml`, `vercel.json`, `wrangler.jsonc`, configurações de lint/format e testes `.test.ts`.
- Scripts de auditoria/build/gates necessários: `audit-release-readiness`, `audit-production-env`, `netlify-build-gate`, `scripts/lib`, `validate-staging-target`, `evolution-preview-smoke`, diagnóstico SQL read-only e preparação de build.

## Conteúdo excluído

- `.env`, `.env.local`, `.dev.vars`, `.vercel`, `.netlify`, `.tanstack`, `dist`, `node_modules` e previews temporários.
- `tests/e2e-artifacts/` e relatórios históricos de homologação.
- Scripts one-off de backfill/sincronização/inspeção de dados e testes manuais ligados a instâncias reais.
- Documentos internos de fases, incidentes, staging, produção e relatórios contendo contexto privado.

## Resultado esperado

A pasta pública instala com `npm ci`, inicia com `npm run dev` usando `.env.example`, executa `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build`, sem depender de qualquer arquivo ou serviço privado da pasta de desenvolvimento.
