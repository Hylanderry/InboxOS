# InboxOS — handoff enxuto e econômico para ChatGPT Work

**Fonte única de código:** `inboxos-fase8-economico-2026-10-02.zip` (não misturar ZIPs anteriores).  **Data:** 02/10/2026.  **Meta:** homologar o build e os fluxos reais, com o menor consumo possível de créditos/infraestrutura.

## Situação comprovada

- 149/149 testes locais passaram (`npm test`, execução repetida). Pré-auditoria: 258 arquivos TS/TSX/MTS com 0 erros de sintaxe, 0 imports locais ausentes e 83 rotas representadas.
- **NÃO** há comprovação de `lint`, `tsc --noEmit`, `vite build`, E2E, Netlify Preview nem integrações reais. `npm ping` retorna `EAI_AGAIN` neste executor.
- O lockfile apresenta **6 divergências**: `@netlify/vite-plugin-tanstack-start` (ausente nas entradas raiz/instaladas), e registros antigos de `@lovable.dev/mcp-js`, `@sentry/cloudflare`, `@lovable.dev/vite-tanstack-config` e `nitro`.
- Evolution: fila, webhook assinado, recuperação agendada, limites de retry e proteção contra redirecionamento em chamadas com credenciais implementados **no código**. Billing permanece OFF.

## Execute somente os gates ainda não comprovados

**E1 — Instalar/compilar (primeiro, maior prioridade).** Em Node >=22.12, npm com internet e branch privada, na raiz do ZIP:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --no-audit --no-fund
npm test
npm run audit:release
npm run lint
npx tsc --noEmit
npm run build
```

**Não fabricar integridades** nem desativar validações. Corrigir apenas falhas reproduzidas, preservar a rota/árvore gerada pelo plugin oficial e registrar o log resumido de cada gate. Se `npm` estiver indisponível, marcar uma vez como `BLOCKED` e não gastar créditos repetindo consultas.

**E2 — Banco e autenticação (staging isolado).** Comparar `supabase/migrations/` com o histórico remoto **por consulta somente leitura**. Reconciliar migrations antigas **somente no repositório/staging**, testar proteção do último owner/superadmin, sessão revogada, OTP e isolamento de dois workspaces, incluindo concorrência. Não executar alterações no Supabase vivo.

**E3 — Integrações E2E em sandbox/teste.** Evolução: receber evento, assinatura HMAC, consumo único, cron de recuperação, retry, queda de worker e grupos/mídia. Resend: OTP e newsletter opt-in apenas para endereço de teste consentido; confirmar 429/5xx, cancelamento, unsubscribe e idempotência. Groq: agente de teste com bloqueio de duplicidade. Não tocar contatos ou instâncias reais.

**E4 — Deploy Preview + UI.** Usar Netlify Deploy Preview isolado, conferir ENV no servidor e `ENABLE_BILLING=false`, `VITE_ENABLE_BILLING=false`. Rodar smoke de autenticação, chamadas API/RBAC, dispositivos mobile e dashboard ADM, validar logs/rollback. Apenas liberar produção após todos os gates P0 e autorização explícita.

## Política de economia e segurança

- **Não reanalisar o projeto todo** nem abrir os relatórios antigos. Consultar `docs/WORK_HANDOFF_EXAUSTIVO_FASE8_2026-10-02.md` **apenas para esclarecer um bloqueio pontual**.
- Agrupar testes e comandos; usar dados sintéticos e serviços gratuitos quando disponíveis; não contratar infraestrutura ou realizar envio pago sem aprovação.
- **Proibido:** reset, DDL/migrations, updates/deletes ou inserções no banco vivo; deploy de produção; mudança de DNS, API keys, webhooks reais ou cofre `INTEGRATION_VAULT_KEY`; logar credenciais; enviar WhatsApp/e-mails reais; ativar Billing.
- Entregar **um ZIP completo corrigido**, **um patch**, e **um único relatório** `PASS/FAIL/BLOCKED` por gate com trecho mínimo de evidência. Agrupar todas as autorizações/acessos necessários em uma única solicitação; não repetir tarefas que já passaram.

**Comandos de apoio:** `npm run build:gated`, `npm run audit:env`, `npm run test:integration` (este último somente contra staging/preview isolado; validar alvo antes de executar). `docs/QA_EVIDENCIAS_RELEASE.md` registra evidências. **Estado atual: não homologado para produção.**
