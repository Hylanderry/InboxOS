# InboxOS — Relatório de finalização para deploy

Data: 27/09/2026
Branch de trabalho: `inboxos-release-finalization`
Alvo: Netlify + Supabase + Evolution API + Resend

## Resultado desta execução

O código funcional foi fechado como **release candidate para deploy**. A denominação é deliberada: o ambiente atual não consegue baixar dependências do npm, então build/lint/typecheck completo e smoke deploy não puderam ser executados aqui.

### Fechado no código

- Settings deixou de ser estrutural: Perfil, Empresa, Segurança, Dispositivos, Workspace, membros, convites, documentos legais, troca de senha/e-mail/telefone e uploads estão conectados aos endpoints reais.
- Workspace ativo não consulta mais `workspace_members` direto do browser; é resolvido pelo backend.
- Login por dispositivo e recovery possuem endpoint/UI de reenvio de OTP.
- Cadastro ganhou rollback do usuário Auth se o primeiro envio do código falhar.
- Convites/membros ganharam rollback e checagem de erros de mutação.
- Primeiro save de empresa cria `workspace_company_profiles` quando necessário.
- E-mails transacionais passam por `system_events -> notification_deliveries -> Resend` com `Idempotency-Key` e retry seletivo.
- `delivered_at` não é marcado apenas porque o Resend aceitou a mensagem; nesse momento o status fica `sent`.
- Webhook Evolution ganhou rate-limit no banco, persistência idempotente e processamento Netlify Background Function.
- Mutações autenticadas ganharam rate-limit por usuário/IP independente de Cloudflare.
- Cloudflare Access foi removido do middleware humano; a Queue Cloudflare continua apenas como compatibilidade opcional.
- Removido fallback silencioso para domínio Worker antigo; `PUBLIC_APP_URL` é obrigatório.
- `routeTree.gen.ts` foi reconstruído com 61/61 rotas reais e sem Lovable/MCP/well-known obsoletos.
- Migration local adicionada para a limpeza do índice duplicado já aplicada no banco vivo.
- Catálogo completo dos endpoints criado em `docs/API_ENDPOINTS.md`.

## Verificação de código

### Testes

```text
npm test
70 tests
70 pass
0 fail
```

### Parse TypeScript/TSX

Todos os fontes `.ts`, `.tsx` e `.mts` de `src`, `netlify` e `tests` foram processados pelo TypeScript 5.8 disponível globalmente:

```text
214 arquivos analisados
0 arquivos com erro sintático
```

Isso é validação sintática, não substitui `tsc --noEmit` com dependências instaladas.

### Route tree

```text
61 createFileRoute() encontrados
61 rotas representadas
0 ausentes
Lovable: ausente
/mcp legado: ausente
/.well-known legado: ausente
```

### Git

`git diff --check` passou.

Scan do source final não encontrou:

- `DEFAULT_WORKSPACE_ID`
- `local-user`
- UUID tenant `00000000-0000-0000-0000-000000000001`
- `STRICT_AUTH`
- `verifyCloudflareAccess`
- domínio Worker antigo
- rotas Lovable antigas

Chamadas diretas a `sendTransactionalEmail` ficaram restritas ao boundary `delivery.server.ts`/`resend.server.ts`.

## Banco vivo

Projeto: `Inbox OS` (`aczstooavclxhmgtsobg`).

- Security Advisor final: **0 lints**.
- Performance Advisor final: somente avisos INFO `unused_index` (22 observados nessa leitura), sem `duplicate_index`.
- Migration `20260927102921 drop_duplicate_whatsapp_instance_name_index` aplicada e presente no histórico vivo.
- Teste adversarial Tenant A × Tenant B passou nos dois sentidos.
- Fixtures do teste foram removidos e confirmados em zero.

## Netlify

A estrutura usa `@netlify/vite-plugin-tanstack-start`, build `npm run build` e publish `dist/client`.

`netlify/functions/evolution-events.mts` é uma Background Function (`background: true`) para consumir `evolution_events` e reencadear fases de sincronização.

## Comandos que o ambiente atual bloqueou

### `npm ci`

```text
EAI_AGAIN registry.npmjs.org
```

### `npm run lint`

```text
eslint: not found
```

### `tsc --noEmit`

```text
TS2688: Cannot find type definition file for 'vite/client'.
```

### `npm run build`

```text
vite: not found
```

### `npm run test:integration`

A suíte iniciou, porém 4/4 chamadas retornaram `fetch failed` porque nenhum servidor pôde ser iniciado sem as dependências.

## Gate final fora deste executor

Há um detalhe de lockfile: `package.json` fixa `@netlify/vite-plugin-tanstack-start@1.3.19`, mas o `package-lock.json` herdado do checkpoint ainda não possui essa entrada. A rede indisponível impediu regenerar o lockfile aqui.

Na primeira máquina com acesso ao npm:

```bash
npm install
git diff -- package-lock.json
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run dev
# em outro terminal
npm run test:integration
```

Revisar e versionar o `package-lock.json` atualizado. Depois disso, voltar a usar `npm ci` nos builds reproduzíveis. A Netlify usa `npm install` por padrão para projetos npm, então o deploy preview pode instalar o plugin a partir do `package.json`, mas esta release só deve ser classificada como totalmente reproduzível após o lockfile ser reconciliado.

Depois realizar Deploy Preview da Netlify, smoke test e matriz visual F9 antes de promover tráfego real.

## Débito conhecido que não bloqueia o deploy contra o Supabase vivo

O SQL histórico exato de todas as migrations aplicadas no banco vivo em 25–26/09 ainda não está integralmente materializado em `supabase/migrations` local. O banco vivo está correto e os endpoints usam esse schema, mas o repositório sozinho ainda não é uma reconstrução bit-a-bit de um projeto Supabase novo.

Não corrigir isso com `db reset` nem reaplicando migrations antigas. A correção correta é exportar/materializar o histórico exato quando Supabase CLI/rede estiver disponível.

## Billing

Billing continua fora do escopo funcional desta release porque nenhum provedor/regra comercial foi aprovado. A UI informa isso explicitamente e não simula cobranças.
