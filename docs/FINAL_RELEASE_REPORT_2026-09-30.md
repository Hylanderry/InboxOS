# InboxOS — Relatório final de código

Data: 30/09/2026  
Alvo: Netlify + Supabase + Evolution API + Resend + Groq

## Estado final do produto no código

As áreas principais estão implementadas e ligadas a backend persistente:

- Dashboard com métricas reais e pipeline separado por moeda;
- CRM com etapas, leads, movimentação e responsável validado dentro do workspace;
- Follow-up persistente, prioridade, prazo, conclusão e responsável tenant-safe;
- Inbox/Evolution, conexões, QR, sync, webhook e processamento durável;
- Agentes Groq manuais e automáticos;
- auto-reply idempotente, auditado em `automation_agent_runs` e `outbound_messages`, com persistência da mensagem enviada no InboxOS;
- Configurações de perfil, empresa, segurança, dispositivos, workspace, membros e convites;
- Auth PF/PJ, OTP, recovery, troca de e-mail/telefone, trusted device e sessão revogável;
- Billing state persistido e endpoint real;
- logout revogando a app session antes do sign-out Supabase.

Billing não fabrica checkout. Cobrança externa exige escolha explícita de provedor, planos, preços, trial, cancelamento e política comercial/fiscal.

## Endpoints e rotas

- 58 rotas HTTP de aplicação em `src/routes/api`;
- 1 Netlify Background Function da Evolution;
- 68 `createFileRoute()` no projeto;
- 68/68 representadas em `src/routeTree.gen.ts`;
- 0 imports internos ausentes.

## Gates executados neste executor

### Testes

```text
73 tests
73 pass
0 fail
0 skipped
```

### Parser TypeScript/TSX/MTS

```text
224 arquivos
0 erros sintáticos
```

### Imports internos

```text
224 arquivos verificados
0 imports internos ausentes
```

### Route tree

```text
68 source routes
68 routeTree entries
cobertura = 100%
```

### Scan de legado/source debt

Não foram encontrados no source operacional:

- `TODO` / `FIXME` relevantes;
- `implemented: false`;
- `Em desenvolvimento`;
- `DEFAULT_WORKSPACE_ID`;
- `local-user`;
- `STRICT_AUTH`;
- `verifyCloudflareAccess`;
- Lovable/MCP operacional.

## Correções adicionais de 30/09

1. `owner_user_id` de CRM/Follow-up agora exige membership ativa do mesmo workspace no endpoint.
2. O Postgres também garante `(workspace_id, owner_user_id) -> workspace_members(workspace_id, user_id)`.
3. Teste adversarial confirmou que `lead A + owner B` e `follow-up A + owner B` são bloqueados pelo banco.
4. Fixtures do teste foram totalmente removidos.
5. Dashboard deixou de somar moedas diferentes em um único valor e agora retorna `pipelineByCurrency`.
6. Follow-up `datetime-local` usa horário local e rejeita prazo inválido/vazio na UI.
7. PATCH vazio de CRM/stages/follow-up/agents retorna 400 em vez de executar mutação ambígua.
8. Stage delete trata 409 somente para FK em uso; outros erros não são mascarados.
9. Auto-reply passa por outbox durável, registra upstream Evolution e persiste a saída localmente sem pausar IA como takeover humano.

## Supabase vivo

Projeto: `Inbox OS` (`aczstooavclxhmgtsobg`).

Migrations finais desta rodada:

- `20260930155753 workspace_product_owner_guards`;
- `20260930160052 workspace_product_owner_index`.

Verificação final:

- Security Advisor: **0 lints**;
- Performance Advisor: apenas `unused_index` INFO;
- sem `unindexed_foreign_keys` após a migration de índice;
- teste adversarial de ownership cross-workspace passou;
- fixtures residuais = 0.

## Gate bloqueado pelo ambiente

O executor continua sem resolver/conectar ao `registry.npmjs.org`. `npm install` falhou com `EAI_AGAIN`; tentativa de contorno por IP/TLS também não estabeleceu conexão.

Portanto **não é correto afirmar** que os seguintes gates passaram aqui:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run dev
npm run test:integration
```

Eles devem ser executados no primeiro CI/máquina/Deploy Preview com acesso ao registry.

## Lockfile

`package.json` fixa `@netlify/vite-plugin-tanstack-start@1.3.19`, mas o `package-lock.json` herdado ainda não contém o pacote. Não foi fabricada uma entrada manual no lockfile. Na primeira máquina com acesso ao npm:

```bash
npm install
git diff -- package-lock.json
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Depois versionar o lock atualizado e voltar a usar `npm ci`.

## Dívida histórica de migrations

O Supabase vivo está correto para o deploy atual, mas parte das migrations antigas de 14–26/09 não está materializada localmente bit a bit com os mesmos timestamps/SQL histórico. Isso não deve ser “corrigido” com `db reset`, `db push` cego ou reaplicação em produção. A reconciliação histórica deve ser feita por exportação exata do `supabase_migrations` em ambiente apropriado.
