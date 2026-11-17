# InboxOS — Checkpoint de Implementação

Data: 26/09/2026
Branch local: `inboxos-handoff-execution`
Base: ZIP `inboxapp-responsive-motion-env-phase3(3).zip`

> Este é um checkpoint de implementação, **não um release final de produção**. O critério final do handoff exige dependências instaladas, route tree regenerada, typecheck, lint, integração, build, smoke test e auditoria tenant A × B. O ambiente atual não consegue resolver `registry.npmjs.org`.

## Implementado nesta execução

### Frontend
- composição Inbox desktop/mobile separada por regra explícita;
- Dock corrigida para não desaparecer fora do Inbox por seleção residual de chat;
- remoção de smooth-scroll global em superfícies realtime;
- estrutura responsiva de Configurações: Perfil, Empresa, Segurança, Dispositivos, Workspace, Privacidade e Billing;
- Auth UI com telefone internacional/E.164, CNPJ, password meter e OTP;
- cinco rotas legais versionadas e dialog/sheet de aceite com desbloqueio somente ao chegar ao fim do scroll;
- cadastro conectado a backend OTP;
- login conectado a sessão Supabase + desafio de dispositivo;
- recovery conectado a start/verify/reset;
- overlay de sessão revogada.

### Auth / segurança
- removidos `local-user`, `DEFAULT_WORKSPACE_ID`, UUID default e `STRICT_AUTH` do caminho humano;
- `requireAuth`, `requireWorkspace`, `requirePermission`, `resolveInstanceContext`;
- membership `active` obrigatória;
- workspace explícito via `x-workspace-id` e validado no servidor;
- sessão de app revogável vinculada ao `session_id` estável do JWT Supabase;
- device token randômico persistido no browser, sem MAC e sem fingerprint como credencial;
- trusted device por 90 dias somente depois de OTP;
- revogação de sessão/dispositivo e `revoke_others`;
- password recovery anti-enumeração com grant curto e bloqueio de reutilização das últimas três senhas;
- troca de e-mail em duas confirmações (antigo → novo), alerta para o e-mail antigo;
- troca de telefone via OTP, persistindo somente E.164;
- HMAC por finalidade para OTP/tokens e scrypt versionado para histórico de senha.

### Cadastro / Resend
- pending registration;
- OTP de 6 dígitos com hash;
- rate-limit por scopes hash de e-mail/device/IP/composite;
- Resend server-side via `RESEND_API_KEY` / `RESEND_FROM_EMAIL`;
- confirmação de usuário Supabase;
- `provision_verified_account_v2`;
- legal acceptances;
- password history inicial;
- security event;
- convite de workspace exige `invitationId + invitationToken` validado contra `token_hash` antes de persistir `invitation_id`.

### Perfil / empresa
- leitura/edição server-side de perfil PF;
- leitura/edição server-side de perfil PJ/workspace;
- `user_id`, `workspace_id` e `role` imutáveis via payload comum;
- avatar/logo em bucket privado `profile-media` com MIME e limite de tamanho;
- CNPJ validado matematicamente antes de persistir mudança.

### Workspaces
- listar/criar/ativar;
- membros;
- roles `owner/admin/agent`;
- suspensão/reativação/remoção com guards;
- convites com token hash e validade;
- aceite e revogação de convite;
- workspace ativo persistido na app session.

### Evolution
- removidos fallbacks de workspace default de `evolution.server.ts` e `sync-engine.ts`;
- `workspaceId` tornou-se obrigatório nos pontos legados alterados;
- cobertura existente de normalização, LID, grupos, paginação, webhook e mensagens permaneceu verde.

### Supabase / reconciliação
- link local `supabase/.temp/linked-project.json` removido porque apontava para projeto antigo/incorreto;
- `supabase/.temp/` ignorado no Git;
- criado `docs/reconciliation/SUPABASE_LIVE_MIGRATIONS_2026-09-26.md` com o histórico vivo conhecido;
- projeto vivo confirmado: `Inbox OS` (`aczstooavclxhmgtsobg`);
- Security Advisor observado: 0 lints;
- warning real ainda pendente: índice duplicado em `whatsapp_instances`.

## Verificação executada

### Passou

```text
npm test
67 tests
67 pass
0 fail
```

`git diff --check` também passou antes dos commits.

### Bloqueado / falhou por ambiente

#### `npm ci`
Bloqueado por DNS/rede do container:

```text
Could not resolve host: registry.npmjs.org
```

#### `npm run test:integration`
Executou os novos contratos, porém todas as chamadas retornaram `fetch failed` porque nenhum servidor pôde ser iniciado sem dependências instaladas.

#### `npm run lint`

```text
eslint: not found
```

#### `tsc --noEmit`

```text
TS2688: Cannot find type definition file for 'vite/client'.
```

#### `npm run build`

```text
vite: not found
```

## P0 ainda aberto antes de release

1. Recuperar/materializar **o SQL exato** das migrations vivas que estão ausentes no checkpoint local; o manifest criado não substitui os `.sql`.
2. Rodar `npm ci` quando o registry estiver acessível.
3. Regenerar TanStack `routeTree.gen.ts`; a referência Lovable obsoleta ainda aparece no arquivo gerado atual e as novas rotas precisam ser incorporadas pela geração oficial.
4. Rodar typecheck, lint e build reais.
5. Subir servidor e executar `npm run test:integration`.
6. Executar matriz visual F9 em browsers/viewport reais.
7. Criar Tenant A / Tenant B e executar o teste adversarial cross-tenant.
8. Executar Security/Performance Advisor novamente após o código/migrations finais.
9. Resolver o índice duplicado de `whatsapp_instances` com migration específica depois da reconciliação.
10. Confirmar se qualquer Worker/Queue Cloudflare ainda processa Evolution antes de remover o legado `access-auth.ts`/Wrangler.
11. Centralizar completamente `system_events → notification_deliveries → Resend` (B14) e revisar retries/logs.
12. Só então fazer smoke test Netlify e gerar o ZIP/release final.

## Legados propositalmente não apagados

- referências Lovable em `src/routeTree.gen.ts`: arquivo gerado; remover pela regeneração TanStack, não por edição manual;
- `CF_ACCESS_*` em `src/server/middleware/access-auth.ts`: não faz mais parte do auth humano novo, porém a remoção total depende de confirmar o pipeline Cloudflare/Evolution legado.

## Segurança de secrets

Nenhum secret real foi adicionado a este checkpoint. O ZIP de checkpoint deve excluir `.env` reais, `.git`, caches e `node_modules`.
