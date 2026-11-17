# Incidente comprovado — Evolution API + Supabase

## Fotografia do estado remoto (02/10/2026, não tempo real)
Leitura somente `SELECT` no Supabase **produtivo** (`aczstooavclxhmgtsobg`): `evolution_events` tinha **38.615 queued**, **8.329 dead_letter**, **21.881 completed**. No recorte:
- `CONTACTS_UPDATE`: 17.642 `queued`, 7.787 `dead_letter`; **7.779** com HTTP 500 `there is no unique or exclusion constraint matching the ON CONFLICT specification`.
- `SYNC_CONTACTS`: **160** `dead_letter` com problema equivalente.
- Outros erros de sincronização de grupos incluem timeouts e falhas 502. Não assumir que a correção do ON CONFLICT corrige todos.
- `MESSAGES_UPSERT queued=9.020` e `CHATS_UPDATE queued=8.081` no mesmo retrato.

O código anterior usava `workspace_id,instance_name,remote_jid` para upsert de contatos, mas o banco exige UNIQUE `(workspace_id,instance_id,remote_jid)`. Para `whatsapp_presence`, o UNIQUE correto é `(workspace_id,instance_id,phone)`. A versão do ZIP de 02/10/2026 contém correções desses pontos, mas **a correção só existe em arquivos locais: não se pode concluir que foi implantada ou que a fila foi drenada**.

## Consulta somente leitura
Na pasta de código já existe `docs/EVOLUTION_DB_DIAGNOSTIC_READ_ONLY_2026-10-02.sql`. Abrir e executar **somente SELECTs** com a conexão correta. Salvar timestamp, status agregados e grupos de erros **sem payloads/telefones**. A inferência de causa é válida para os eventos citados, não para toda a fila.

## Plano seguro de remediação (sequência obrigatória)
1. **Antes de qualquer envio:** implementar/validar build e staging com o hotfix, constraints coerentes e idempotência. Registrar comportamento de `CONTACTS_UPDATE`, `SYNC_CONTACTS` e `PRESENCE_UPDATE` com eventos sintéticos.
2. Homologar consumidor, job Netlify cron e retry em staging. Conferir se funções têm envs necessários, se há consumidores ativos, fluxo `queued→processing→completed`, e filas stale. Mecanismo agendado está limitado a **aproximadamente 18 eventos/10 minutos** por padrão; não será suficiente para resolver rapidamente dezenas de milhares de pendências.
3. Depois de gates PASS, pedir autorização do dono **apenas para publicar o hotfix**. Monitorar erros 42P10, 429, 5xx, taxas de fila e número de worker starts.
4. Reprocessar `dead_letter` somente com autorização **distinta**, por canário (por exemplo, até 10 eventos dos tipos/erros comprovados) e limitador de taxa; monitorar efeitos e idempotência antes de aumentar o lote. Não misturar erros 42P10 com timeouts/grupos. **Nenhum UPDATE SQL fornecido aqui deve ser disparado sem aprovação**.
5. Para `queued` antigos: definir política de retenção e reprocessamento por tipo. Confirmar que replay não aciona Groq/respostas automáticas antigas nem dispara envios de saída inesperados. Medir backlog e throughput; expandir lote apenas com headroom real.
6. Registrar antes/depois por quantidade, latência, sucesso e taxa de erro. Se houver regressão/duplicidade, parar worker/backfill, manter ingestão segura e executar rollback do código.

## Proibições operacionais
- Não publicar hotfix diretamente por causa do backlog; a correção deve passar staging.
- Não reconfigurar os webhooks de produção por um Deploy Preview.
- Não tratar `HTTP 202` de webhook como prova de persistência de contatos/mensagens.
- Não disparar mensagens reais ou IA para verificar se o backlog foi corrigido.
- Scripts históricos de correção em massa, sincronização direta e backfill foram removidos do template. Qualquer operação desse tipo deve ser implementada como migration/rota escopada e validada em staging antes de ser adicionada novamente.
- Evitar divulgar amostras de payload, telefones, tokens ou identificadores de clientes.

## Critério para encerrar incidente
Taxa de erros 42P10 zerada **após deploy aprovado**, entrada/saída de eventos saudáveis, estabilidade de filas por janela observada, mortos tratados por classes, sem conversas duplicadas/atribuídas ao workspace errado, e evidências de monitoramento. A ausência de lints no Security Advisor não basta.
