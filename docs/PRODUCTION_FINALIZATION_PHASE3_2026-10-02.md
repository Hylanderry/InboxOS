# InboxOS — Fase 3: segurança de identidade, bloqueio de deploy e mapa de homologação

**Data:** 02/10/2026. **Base:** `inboxos-release-hardening-2026-10-02.zip`.
**Estado:** alterações locais verificadas; **NÃO HOMOLOGADO PARA PRODUÇÃO**.

Este pacote não altera o Supabase remoto, não envia mensagens de verdade, não configura segredos e não dispara deploy.
O Billing permanece explicitamente desligado no core; funcionalidades bilíngues e fork comercial fora do escopo.

## 1. Implementado nesta revisão

### Identidade e códigos OTP
- `verifyPhoneChange` e as duas etapas de `email-change` deixam de aceitar `verified_at` isoladamente: revalidam o digest do código com comparação de tempo constante (função compartilhada `recoveryCodeIsVerified`).
- O bloqueio `blocked_until` também é respeitado quando um código tinha sido marcado como verificado.
- Emissão de novos desafios em troca de e-mail e telefone tem limitação **5 solicitações/hora por usuário e fluxo**, via RPC transacional `consume_auth_rate_limit`.
- Verificação de códigos em recuperação de senha, troca de telefone e troca de e-mail tem limitação **10 tentativas/10 minutos por desafio**, inclusive entre IPs. Quando a RPC falha, a operação é bloqueada (503).
- A recuperação de senha consome sua autorização usando compare-and-set em `email_challenges` **antes** de alterar a senha na API Supabase Auth; um segundo envio com o mesmo grant obtém 409.
- A troca de telefone consome o desafio de forma única antes de atualizar o perfil.
- A troca de e-mail exige que o desafio novo esteja vinculado a um desafio anterior válido e confirmado. Ambos são consumidos uma vez antes das alterações de identidade, reduzindo a possibilidade de corrida/replay.
- Erros na gravação do grant de e-mail antigo, no histórico de senhas, na revogação de sessões e na trilha de auditoria deixam de ser ignorados.
- **Observação operacional:** em caso de falha do Supabase Auth após um código ser consumido, será necessário iniciar um novo desafio. Não há transação distribuída entre Postgres, Supabase Auth e provedores de e-mail; isso ainda precisa de testes de falha em staging.

### Gates de publicação
- Netlify: o comando `build` agora chama `npm run build:gated`, que exige `npm test`, `npm run audit:release`, `npm run lint`, `npx tsc --noEmit` e `npm run build`; em `CONTEXT=production`, exige também `npm run audit:env`.
- A execução `node scripts/netlify-build-gate.mjs --plan` lista os passos sem usar segredos.
- O workflow manual de staging injeta `PRODUCTION_APP_URL` no processo de smoke HTTP. Um novo validador impede execução remota sem URL de produção declarada e impede testar o mesmo origin de produção.
- O teste HTTP manual de staging inclui verificação anônima de endpoints do ADM global e negativa de uma mutação cross-site, sem mensagens reais.

## 2. Evidências locais

| Checagem | Resultado |
| --- | --- |
| `npm test` | **116 / 116 aprovados** |
| Parser TypeScript/TSX/MTS | **252 arquivos; 0 erros de sintaxe** |
| Imports internos | **0 não resolvidos** |
| Route tree estática | **83 rotas; 0 ausências** |
| Guardas de Billing | **Presentes; flags OFF** |
| Plano de gates Netlify | **Validado por testes unitários** |
| Execução real do gate Netlify | **Interrompe antes do build pelo lock divergente (comportamento intencional)** |
| `npm ci --offline` | **ENOTCACHED** no pacote `@netlify/vite-plugin-tanstack-start` |
| Lint / Typecheck / Build Vite | **NÃO comprovados** (dependências indisponíveis) |
| Execução HTTP/integração em ambiente publicado | **NÃO executada** |

O `package-lock.json` possui **6 divergências** de inventário direto. Não foram inventados hashes, integridades nem resoluções npm para fingir correção. A ausência de dependências também impede saber a quantidade real de erros de ESLint e TypeScript; possíveis problemas nesse estágio devem ser corrigidos após instalar as dependências.

## 3. Pendências por etapas, na ordem correta

### E1 — Dependências e compilação [BLOQUEADA: acesso ao npm]
1. Rodar `bash scripts/prepare-production-build.sh` em ambiente com rede funcional.
2. Revisar e commitar o `package-lock.json` regenerado com npm oficial, eliminando as 6 divergências.
3. Executar `npm ci`, `npm test`, `npm run audit:release`, `npm run lint`, `npx tsc --noEmit` e `npm run build` até **todos** passarem.
4. Corrigir problemas encontrados sem desligar checks apenas para forçar aprovação. Fazer inventário de pacotes/avisos de dependência, incluindo verificação `npm audit` para advisories relevantes.

### E2 — Banco de homologação e migrations [BLOQUEADA: staging/reconciliação]
1. Criar projeto Supabase de staging separado do banco vivo e preservar snapshot/backup.
2. Reconciliar migrations antigas (especialmente 14–26/09) com o histórico real antes de qualquer `db push`.
3. Aplicar e testar **somente em staging** a migration pendente `20261001230000_protect_last_privileged_members.sql`.
4. Testar concorrência com duas sessões removendo owners/superadmins, transferência atômica, suspensão global e RLS entre tenants.
5. Confirmar índices, restrições e Security/Performance Advisors em staging. Não usar `supabase db reset` no banco vivo.

### E3 — Auth e administração [BLOQUEADA: integração autenticada]
1. Criar contas sintéticas/verificadas e testar fluxo completo de cadastro, OTP, login, senha e troca de e-mail/telefone.
2. Testar 401/403/409/429/503 e sucesso real para sessões válidas, revogadas, suspensas e roles ADM diferentes.
3. Testar repetição de grants, múltiplos IPs, concorrência, timeout da RPC, queda após consumo de OTP e rollback/reconciliação.
4. Executar testes autenticados dos 103 contratos HTTP; o inventário estático **não** prova funcionamento.

### E4 — Provedores externos [BLOQUEADA: credenciais de teste]
1. Evolution API: QR, conexão, mensagens, mídia, grupos, webhook seguro, reentrega, fila/background e replay.
2. Groq: modelos configurados, timeout, falhas, respostas duplicadas e limites de custos.
3. Resend: domínio remetente verificado, OTP, notificações, Broadcasts, cancelamento, opt-in/opt-out e bounce.
4. Storage: upload permitido e rejeitado, URLs públicas apenas onde necessário, acesso negativo a objetos privados.

### E5 — Netlify Deploy Preview e UX [BLOQUEADA: deploy isolado]
1. Configurar ambientes de preview **sem segredos de produção** e exigir os gates automatizados.
2. Definir `vars.PRODUCTION_APP_URL` no GitHub, passar o URL de preview e executar `.github/workflows/staging-smoke.yml`.
3. Testar frontend real em 320/360/390 px, tablet, desktop, landscape e teclado iOS; ADM, Inbox, Settings, dados vazios, erros e uploads.
4. Verificar logs/redaction, observabilidade, tempo de resposta, retry/backoff e comportamento sob falha de APIs.

### E6 — Go-live seguro [BLOQUEADA: E1–E5]
1. Revisar segredos de produção (cofre 32 bytes, URL, Resend, Evolution, Auth, Supabase) somente na plataforma.
2. Remover `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` e manter Billing OFF nas duas flags.
3. Configurar branch protection, ambiente de produção protegido e política de rollback testada.
4. Reexecutar todos os gates e promover apenas se **sem bloqueadores**.
5. Após go-live, verificar webhooks, e-mails, erros de autenticação, filas, taxas 5xx e alarmes.

## 4. Comandos operacionais

```bash
# Ambiente confiável com acesso ao registry oficial npm:
bash scripts/prepare-production-build.sh

# Plano de liberação local, sem executar deploy:
CONTEXT=production node scripts/netlify-build-gate.mjs --plan

# Rodar smoke contra preview isolado (não produção):
PRODUCTION_APP_URL=https://seu-app.example \
TEST_BASE_URL=https://deploy-preview-123--seu-app.netlify.app \
npm run test:integration
```

**Critério final:** somente classificar como pronto quando instalação, lint, TypeScript, build, migrations no staging, testes autenticados/fornecedores, preview e rollback estiverem demonstravelmente aprovados. A suíte atual é majoritariamente local/contratual, e **não** autoriza publicar diretamente.
