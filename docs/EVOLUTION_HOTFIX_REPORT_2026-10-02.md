# InboxOS — Auditoria de incidente Evolution API e hotfix (02/10/2026)

## 1. Diagnóstico comprovado em Supabase PRODUÇÃO (consultas SELECT somente)

Snapshot da tabela `public.evolution_events`: `queued=38.615`, `dead_letter=8.329`, `completed=21.881`; não são números permanentes e podem variar. Principais filas: `CONTACTS_UPDATE queued=17.642`, `MESSAGES_UPSERT queued=9.020`, `CHATS_UPDATE queued=8.081`. `CONTACTS_UPDATE dead_letter=7.787`, das quais **7.779** exibiam `HTTP 500: there is no unique or exclusion constraint matching the ON CONFLICT specification`. `SYNC_CONTACTS dead_letter` com a mesma causa: **160**. Outras falhas incluem timeout de sync de grupos. A origem é divergência real no esquema: unique `(workspace_id, instance_id, remote_jid)` em `whatsapp_contacts`, mas upsert antigo usava `instance_name`. `whatsapp_presence` também exige `(workspace_id, instance_id, phone)`, diferente do código anterior.

Consultar em `docs/EVOLUTION_DB_DIAGNOSTIC_READ_ONLY_2026-10-02.sql`. Não houve UPDATE/INSERT/DELETE no Supabase, nem mudança de webhook/instância e nem mensagens reais enviadas.

## 2. Hotfix feito em código (não implantado)

- Corrigidos quatro upserts de `whatsapp_contacts` em webhook, sync e import para `workspace_id,instance_id,remote_jid`, preservando `instance_id` da instância cadastrada.
- Corrigido `PRESENCE_UPDATE` para UNIQUE real `(workspace_id,instance_id,phone)` e tratamento de erro de DB.
- Compatibilidade com objetos individuais e listas da Evolution V2 em contatos/chats; não apagar nomes/fotos por campos ausentes, nem confundir JID `@lid` com telefone real.
- Suporte conservador a edição em `MESSAGES_EDITED` e `MESSAGES_UPDATE`, exclusão e recibos. Atualização normal contendo texto não é rotulada como edição. Operações de edição, exclusão, reação e recibos foram limitadas à instância para evitar cruzamento no mesmo workspace.
- Envio outbound com reserva de idempotência atômica no DB (insert-first/compare-and-swap); 408, rede e HTTP 5xx são resultados de entrega incerta, sem reenvio cego. Após HTTP sucesso da Evolution, estado `accepted` gravado antes da persistência do histórico; se o histórico falhar, resposta 202 de reconciliação para não enviar duplicatas.
- Bot IA não dispara para replay antigo de MESSAGES_UPSERT nem MESSAGES_SET. Datas inválidas deixam de quebrar normalização de sync.
- Persistência de presença, grupos, contatos, arquivamento, ligações e atualização de outbox propaga erros relevantes para permitir retry em vez de confirmar evento silenciosamente.
- Script de smoke test para Deploy Preview isolado `scripts/evolution-preview-smoke.mjs` com dry-run por padrão e bloqueio de domínio de produção.

## 3. Testes executados e limites

- **185/185 testes automatizados PASS** (166 preexistentes, 19 novos). Testes novos incluem 5 eventos simulados e HTTP loopback local, tipos de evento, timestamp, edições, presença, idempotência e escopo de instância.
- Auditoria: **266 arquivos TypeScript/TSX/MTS** analisados sem erros de sintaxe, 83 rotas representadas, 0 imports locais ausentes, Billing permanece OFF. **Lockfile FAIL: 6 divergências**.
- `npm ci --offline` falhou `ENOTCACHED` para `@netlify/vite-plugin-tanstack-start`; não foram executados lint, tsc total, build Vite/Netlify ou teste de deploy por falta de deps.
- Smoke HTTP local **não** é tráfego com a Evolution API real nem teste E2E do InboxOS publicado. Não havia credenciais/ambiente separado confirmado que autorizasse envio externo seguro.

## 4. Estado e risco residual

**NÃO PRONTO PARA PRODUÇÃO.** O deploy corrente ainda não recebeu o hotfix; o backlog do DB permanece. A implantação exige build real, validação em staging e deploy aprovado. O cron padrão de recovery (~18/10 min) não drena >38k eventos rapidamente e `dead_letter` exige reprocessamento seletivo e aprovado. Pode haver bugs adicionais visíveis só em testes reais; nenhum teste pode garantir ausência absoluta de bugs. Não alterar o Supabase produtivo nem enviar mensagens a contatos sem autorização.

**Handoff econômico:** `INBOXOS_EVOLUTION_WORK_BRIEF_2026-10-02.md`. Ler só esse documento + ZIP novo quando executar os gates externos.
