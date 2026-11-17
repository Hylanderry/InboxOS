# Handoff de staging seguro

O workflow manual `.github/workflows/staging-smoke.yml` oferece um smoke
Evolution sintético opcional. Para habilitá-lo, configure as variáveis de
repositório `EVOLUTION_STAGING_INSTANCE`, `EVOLUTION_STAGING_SUPABASE_REF`,
`EVOLUTION_PRODUCTION_SUPABASE_REF`, `PRODUCTION_APP_URL`,
`STAGING_ISOLATED_DB_CONFIRMED`, `STAGING_VERCEL_PREVIEW_CONFIRMED` e
`STAGING_AUTOREPLY_DISABLED_CONFIRMED`, além do segredo
`EVOLUTION_STAGING_WEBHOOK_TOKEN`. A entrada `run_evolution_smoke` deve ser
ativada manualmente; a política fail-closed rejeita aliases de produção e o
script envia somente eventos sintéticos para a webhook do preview.

Este checklist é obrigatório antes do próximo deploy. O staging precisa ser
isolado de produção em três pontos: projeto Supabase, instância Evolution e URL
de deploy.

## Variáveis mínimas

Configure-as somente no preview/staging, nunca em um arquivo versionado:

```text
TEST_BASE_URL=https://<deployment-preview>.vercel.app
PRODUCTION_APP_URL=https://<producao-confirmada>
EXPECTED_SUPABASE_PROJECT_REF=<ref-do-supabase-staging>
EVOLUTION_STAGING_WEBHOOK_URL=https://<deployment-preview>.vercel.app/api/public/webhooks/evolution
EVOLUTION_STAGING_INSTANCE=<instancia-evolution-de-teste>
EVOLUTION_STAGING_WEBHOOK_TOKEN=<segredo-independente-com-16-ou-mais-caracteres>
EVOLUTION_STAGING_SUPABASE_REF=<ref-do-supabase-staging>
EVOLUTION_PRODUCTION_SUPABASE_REF=<ref-do-supabase-producao>
STAGING_ISOLATED_DB_CONFIRMED=yes
STAGING_VERCEL_PREVIEW_CONFIRMED=yes
STAGING_AUTOREPLY_DISABLED_CONFIRMED=yes
EVOLUTION_ALLOW_PREVIEW_WEBHOOK_WRITE=true
```

O preview deve usar um banco vazio ou dados sintéticos. Não reutilize a chave,
instância, webhook, telefone ou workspace de produção.

## Ordem de validação

1. Aplicar todas as migrations em ordem no Supabase de staging.
2. Confirmar RLS, buckets privados e as quatro chaves únicas de workspace/
   instância com `supabase/migrations`.
3. Publicar um Deploy Preview e confirmar que `TEST_BASE_URL` não é alias de
   produção.
4. Executar `node scripts/validate-staging-target.mjs`.
5. Executar `npm run audit:public`, `npm run test:integration`,
   `npm run test:staging:browser` e `node scripts/evolution-preview-smoke.mjs`.
6. Fazer QA autenticado com dois usuários, dois workspaces e duas instâncias;
   testar IDOR, presença, recibos, texto e cada tipo de mídia.
7. Confirmar que não houve resposta automática nem envio para contatos reais.

Se qualquer etapa falhar, não promova o build. O endpoint `/api/health` só deve
expor liveness anônimo; diagnósticos detalhados exigem o segredo de healthcheck
ou uma sessão administrativa autenticada.
