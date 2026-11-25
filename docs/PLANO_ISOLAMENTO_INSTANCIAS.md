# Plano de isolamento de instâncias WhatsApp entre clientes (P0 — incidente)

> Data: 2026-11-25 · Severidade: **crítica** · Relato: cliente criou conta nova e viu a instância
> e o WhatsApp pessoal do dono. Nenhuma hipótese aceitável de repetição.

## 1. Causa provável (evidenciada no código, NÃO confirmada no banco de produção)

| Evidência | Arquivo |
|---|---|
| Migration insere **todo** usuário existente como `agent` no workspace padrão `…0001` | `supabase/migrations/20260915120000_fix_auto_workspace_member_and_lids.sql:1-8` |
| Trigger em `auth.users` coloca **todo cadastro novo** no workspace `…0001` (primeiro = owner, demais = agent) | mesma migration, `:11-43` |
| A instância do dono está no workspace `…0001`; `GET /api/instances` lista por `auth.workspaceId`, então quem é membro de `…0001` enxerga a instância | `src/routes/api/instances/index.ts:62-142` |
| Reparo existe mas **só apaga `role='agent'`** e depende de ter sido aplicado | `supabase/migrations/20261017090000_repair_workspace_isolation.sql` |
| Limpeza paliativa só roda no fluxo de cadastro por senha/convite | `src/server/auth/registration.server.ts:387-400` |
| Backlog já marca como não confirmado: "migrations aplicadas em produção" | `docs/BACKLOG_AJUSTES_2026-11-17.md` (P0) |

Nota: a versão original do trigger (`20260912222323`) só concedia acesso ao primeiro usuário; foi a `20260915120000`
que a reescreveu para conceder a todos. O `role` aceita apenas `owner`/`admin`/`agent` e a tabela tem `status`.

Hipóteses a confirmar com o diagnóstico (seção 3): (a) a migration `20261017090000` não foi aplicada em
produção; (b) foi aplicada, mas sobraram membros com outros papéis (`admin`, `manager`, etc.);
(c) existe outro caminho de criação de conta (OAuth/convite/admin) que ainda concede `…0001`.

## 2. Princípios inegociáveis

1. Um usuário só enxerga instâncias de workspaces em que é membro **explícito**.
2. Nenhuma conta nova herda workspace. Membership só nasce por: cadastro (cria workspace próprio)
   ou convite aceito.
3. O workspace padrão legado `…0001` não pode ser alcançável por contas ordinárias.
4. A defesa não pode depender só do app: **RLS + constraints no banco** garantem mesmo se o código falhar.
5. Toda chamada à Evolution carrega `workspace_id` + `instance_id` resolvidos no servidor, nunca só o nome.

## 3. Fase 0 — Diagnóstico read-only (hoje, sem alterar nada)

Scripts prontos: `docs/sql/01_diagnostico_readonly.sql` (diagnóstico), `docs/sql/02_contencao_producao.sql`
(contenção, transação com trava de segurança) e `docs/sql/03_rollback_e_pos_verificacao.sql`.

Rodar no SQL Editor do Supabase de produção (só `SELECT`, sem telefones, e-mails ou mensagens):

```sql
-- 3.1 Estado do workspace padrão
select role, count(*) from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-000000000001' group by role;

-- 3.2 Quantos membros do padrão NÃO deveriam estar lá
-- (têm outro workspace próprio)
select count(*) from public.workspace_members wm
where wm.workspace_id = '00000000-0000-0000-0000-000000000001'
  and exists (select 1 from public.workspace_members o
              where o.user_id = wm.user_id and o.workspace_id <> wm.workspace_id);

-- 3.3 Instâncias no workspace padrão
select count(*) from public.whatsapp_instances
where workspace_id = '00000000-0000-0000-0000-000000000001';

-- 3.4 Trigger de auto-membership ainda ativo?
select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname = 'bootstrap_first_workspace_owner';

-- 3.5 Migration de reparo aplicada?
select version from supabase_migrations.schema_migrations
where version in ('20260915120000','20261017090000') order by version;

-- 3.6 Alguma instância/chat acessível por usuário de OUTRO workspace? (deve retornar 0)
select count(*) from public.whatsapp_instances i
join public.workspace_members wm on wm.workspace_id = i.workspace_id
where wm.user_id in (select user_id from public.workspace_members
                     group by user_id having count(distinct workspace_id) > 1);
```

Critério de decisão: se 3.1 mostrar mais de 1 `owner` real ou papéis diferentes de `agent`, ou se 3.4
mostrar um corpo que insere em `workspace_members`, a contenção da Fase 1 é obrigatória agora.

## 4. Fase 1 — Contenção em produção (exige autorização explícita + rollback)

> Regra do projeto: nada de DDL/DML em produção sem autorização e plano de rollback.

1. **Backup**: `create table private.wm_backup_20261125 as select * from public.workspace_members;`
2. **Parar o sangramento**: aplicar/confirmar o trigger neutro (corpo `return new;`) de
   `20261017090000`.
3. **Remover acesso indevido** (lista explícita dos `user_id` do dono legítimo, nunca por papel):
   ```sql
   delete from public.workspace_members
   where workspace_id = '00000000-0000-0000-0000-000000000001'
     and user_id not in (<UUID_DO_DONO>, <outros legítimos aprovados pelo dono>);
   ```
4. **Verificar**: repetir 3.1–3.6; logar com conta de teste nova e confirmar lista de instâncias vazia.
5. **Rollback**: `insert into public.workspace_members select * from private.wm_backup_20261125
   on conflict do nothing;` (restaura exatamente o estado anterior).
6. **Revogar sessões** dos usuários removidos (access tokens continuam válidos até expirar) e
   conferir se `src/server/middleware/auth.ts` relê o membership a cada requisição.
7. **Avaliar exposição**: levantar nos logs do Supabase/Vercel quais usuários consultaram o workspace
   `…0001`. Há dado pessoal de terceiros no WhatsApp do dono; avaliar obrigações da LGPD (comunicação
   de incidente) e registrar o ocorrido.

## 5. Fase 2 — Correção estrutural (staging primeiro)

### I1. Migration de blindagem do workspace padrão
- Trigger `BEFORE INSERT` em `workspace_members` que **recusa** inserir em `…0001` quando o usuário
  não está na allowlist de owners legados (tabela `private.legacy_workspace_owners`).
- Remover/arquivar definitivamente `private.bootstrap_first_workspace_owner` e o trigger.
- Teste: criar usuário novo em staging → 0 linhas em `workspace_members` de `…0001`.

### I2. RLS por membership em todas as tabelas do WhatsApp
- `whatsapp_instances`, `whatsapp_contacts`, `whatsapp_presence`, `chats`, `messages`,
  `evolution_events`: policy `workspace_id in (select workspace_id from workspace_members where user_id = (select auth.uid()))`
  em `SELECT/UPDATE/DELETE` e `WITH CHECK` em `INSERT/UPDATE`.
- `service_role` só no servidor, sempre via `scopedAdmin(workspaceId)` (A3, já implementado).
- Teste negativo automatizado: usuário do workspace A não lê nem 1 linha do B (REST direto, realtime e RPC).

### I3. Instância pertence a exatamente um workspace
- Índice único global em `instance_name` e em `evolution_instance_id` (confirmar `20261018092000`).
- Nome da instância na Evolution gerado no servidor com prefixo do workspace
  (`ws<8 hex>-<slug>`); cliente nunca escolhe nome cru.
- Criar instância sem corrida check-then-insert: `insert ... on conflict` + checar `workspace_id` do retorno
  (`instances/index.ts:195-216`).

### I4. Webhook e fila escopados por instância, não por nome
- Segredo/token **por instância** (HMAC) em vez de token global (`webhooks/evolution.ts:167-181`).
- Replay usa `workspace_id`/`instance_id` gravados no evento (`event-inbox.ts:120-139`).
- Watchdog não reescreve webhook de instância que não pertence ao ambiente atual.

> **Status I4 (implementado no código, 2026-11-25):** token por instância = HMAC-SHA256(segredo mestre,
> nome da instância), configurado no webhook de cada instância e exigido no recebimento; replay interno
> carrega e valida `workspace_id`/`instance_id`. **Rollout:** ao implantar, o watchdog reconfigura as instâncias
> (detecta `auth` divergente). Enquanto houver instância antiga, o segredo global continua aceito com aviso no
> log. Depois que todas estiverem migradas, definir `EVOLUTION_WEBHOOK_LEGACY_TOKEN=deny` na Vercel.
> Pendente em I4: impedir que o watchdog reescreva webhook de instância que não pertence ao ambiente.

### I5. Envio, leitura e mídia
- `messages/send.ts`: exigir `instanceId` explícito e validar que pertence ao workspace do usuário
  (hoje escolhe qualquer número conectado, `:86-96`).
- `persist_inbox_message` buscar chat por `instance_id`, não `instance_name`.
- `/api/media/$`: remover caminho legado `chat/` com `ilike` (`_` vira curinga).

### I6. Ciclo de vida
- Purge de workspace apaga também a instância na Evolution (`instance-lifecycle.ts:197-202`).
- `useInstances` limpa estado e refaz fetch ao receber `inboxos:workspace-change`
  (hoje mostra o workspace anterior por até 30 s).

### I7. Auditoria contínua
- Job diário (read-only) que alerta se: membro de `…0001` fora da allowlist; usuário com acesso a
  instância de outro dono; instância sem `workspace_id`.
- Teste de contrato no CI: toda migration nova que toque `workspace_members` precisa de teste de isolamento.

## 6. Testes de aceite (todos obrigatórios, 2+ workspaces, staging)

| ID | Cenário | Esperado |
|---|---|---|
| T1 | Cadastro novo por senha | 0 instâncias, 1 workspace próprio |
| T2 | Cadastro novo por OAuth/convite/admin | idem |
| T3 | Usuário B chama `GET /api/instances` | só as do workspace B |
| T4 | Usuário B chama REST/realtime direto em `chats`, `messages`, `whatsapp_instances` do A | 0 linhas / erro RLS |
| T5 | B tenta enviar usando `instanceId` do A | 403 |
| T6 | B cria instância com nome já usado por A | recusado, sem vazar existência |
| T7 | Webhook com token de outra instância | rejeitado |
| T8 | Troca de workspace na UI | lista antiga some imediatamente |
| T9 | Tentativa de inserir membro em `…0001` | bloqueada pelo trigger I1 |

## 7. Ordem de execução

1. **Hoje:** Fase 0 (diagnóstico) → Fase 1 (contenção) com autorização.
2. **Criar Supabase de staging + Evolution sandbox** (pré-requisito de I1–I7; hoje o `.env` aponta para produção).
3. I1 e I2 (banco) → I3 a I6 (app) → I7 (monitoramento) → testes T1–T9 → só então produção, com rollback.
4. Registrar evidência (saídas das consultas, screenshots) em `docs/` e marcar P0 como concluído no backlog.
