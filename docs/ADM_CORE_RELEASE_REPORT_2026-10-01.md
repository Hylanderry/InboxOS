# InboxOS — Fechamento do core e ADM global

**Data:** 1º de outubro de 2026. **Classificação:** release candidate, aguardando certificação de build e integrações.

## Entregas implementadas

- Control Plane global separado do admin de workspace, com papéis `superadmin`, `operator`, `support`, `auditor` e ações sujeitas a RBAC no servidor.
- Bootstrap atômico do primeiro System Admin com `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` e RPC concedida apenas a `service_role` (função já aplicada ao banco vivo).
- Gestão de usuários, suspensão global, revogação de sessões, status de workspaces, membros, roles, convites por e-mail, revogação, System Admins e log de auditoria.
- Integrações gerenciáveis no ADM (Evolution URL/API key/webhook token, Groq, Resend e custom). Cofre com AES-256-GCM e chave mestra somente no servidor; valores retornam apenas como máscaras.
- Integração desativada bloqueia acesso ao provedor. Fallback ENV apenas quando habilitada e sem chave no cofre. Rotação de webhook Evolution passa a invalidar credencial anterior na validação principal; caminho legado de validação ENV-only removido.
- Newsletter com rascunho, editor em blocos, upload de imagens e vídeos, segmentos/contatos com consentimento, Broadcast Resend e confirmação explícita de envio. Vídeos viram capa/CTA clicável em e-mail.
- Billing desligado por flags distintas de backend e frontend (`ENABLE_BILLING=false`, `VITE_ENABLE_BILLING=false`), sem alterar o fork futuro.
- Migrations locais dos módulos de ADM/cofre/newsletter espelhadas com os timestamps do histórico vivo. Não foi realizado `db reset`.

## Gate realizado neste executor

| Verificação | Resultado |
|---|---|
| `npm test` (testes Node) | **81/81 aprovados** |
| Parser TS/TSX/MTS de `src/` e `netlify/` | **247 arquivos, 0 erros sintáticos** |
| Imports internos relativos e via `@/` | **550 referências, 0 ausentes** |
| Árvore de file routes | **83/83** (73 API + 10 outras) |
| Métodos declarados nas APIs | **103** (inventário completo anexo) |
| Supabase Security Advisor | **0 lints** |
| Supabase Performance Advisor | somente **37 `unused_index` (INFO)** na consulta final |
| Teste anterior de bootstrap no Supabase vivo | primeiro claim verdadeiro, segundo falso; 0 fixtures restantes |

**Não executado / não comprovado:** `npm install`, lint, typecheck completo, `vite build`, testes de integração com app em execução, testes de navegador F9 e envio real Evolution/Groq/Resend. A infraestrutura do executor não resolve `registry.npmjs.org` (EAI_AGAIN); `npm run build` retorna `vite: not found` porque não há `node_modules`. O `package-lock.json` legado ainda não inclui `@netlify/vite-plugin-tanstack-start@1.3.19`; não forjar lockfile manualmente.

## Pendências de ativação e produção

1. Configurar ENV com chaves próprias em Netlify; `INTEGRATION_VAULT_KEY` deve ser Base64 de 32 bytes; `AUTH_CRYPTO_SECRET` deve permanecer seguro e estável.
2. Configurar `SYSTEM_ADMIN_BOOTSTRAP_EMAILS` para o primeiro superadmin (0 admins globais ativos no último snapshot). Após o primeiro claim o bootstrap para automaticamente.
3. Executar `npm install`, revisar/commit `package-lock.json`; depois `npm test && npm run lint && npx tsc --noEmit && npm run build`.
4. Subir Deploy Preview e executar `npm run test:integration` com servidor ativo e smoke real de 103 contratos, abrangendo login/OTP, multi-tenant, convite, evolução QR/webhooks/mensagens/mídia, Groq, cofre/rotação, newsletter, sessions e monitoramento de filas.
5. Validar renderização mobile real e layout ADM/Settings; configurar mídia `newsletter-media` para links públicos onde necessário, sem permitir escrita pública.
6. Confirmar e-mail remetente/destinatário/segmentos no Resend; nenhum disparo de newsletter foi feito pelo processo de desenvolvimento.
7. Histórico de migrations legado de 14–26/09 ainda tem diferenças em relação ao banco vivo; não rodar `supabase db reset`/reaplicar histórico em produção.

**Não certificar produção nem prometer 100% dos endpoints funcionais antes desses testes.**
