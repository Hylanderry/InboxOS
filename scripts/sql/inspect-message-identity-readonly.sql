-- InboxOS G2-03 | DIAGNOSTICO SOMENTE LEITURA | staging isolado
-- Conferir project_ref do Supabase ANTES de executar; NÃO substitui E2E.
-- Proposito: identificar schema real, indices, dados sem instance_id e inconsistencias
-- entre message.instance_id e chat.instance_id. NAO altera absolutamente nenhum registro.
-- Este snapshot nao consegue revelar mensagens de outra instancia que foram recusadas
-- pela UNIQUE antiga: a ausencia de duplicatas NAO comprova ausencia de colisoes.

-- 1. Colunas reais (versoes legadas variam).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('messages', 'chats', 'whatsapp_instances')
  and column_name in ('id', 'workspace_id', 'instance_id', 'external_id', 'client_message_id', 'chat_id', 'instance_name')
order by table_name, ordinal_position;

-- 2. Indices, incluindo unicos parciais (ON CONFLICT deve corresponder ao index).
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('messages', 'chats')
order by tablename, indexname;

-- 3. Constraints e FKs como existem agora; migrations locais NAO sao fonte do schema vivo.
select conrelid::regclass::text as relation_name, conname, contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid in ('public.messages'::regclass, 'public.chats'::regclass)
order by relation_name, conname;

-- 4. Resumo por workspace sem texto, numero de telefone ou IDs de mensagens.
-- Executar SO se a consulta 1 confirmar estas colunas em mensagens/chats.
select m.workspace_id,
       count(*) as message_count,
       count(*) filter (where m.instance_id is null) as missing_instance_id,
       count(*) filter (where m.external_id is not null) as with_external_id,
       count(*) filter (where c.id is null) as missing_chat,
       count(*) filter (where c.id is not null and c.workspace_id is distinct from m.workspace_id) as mismatched_workspace,
       count(*) filter (where c.id is not null and c.instance_id is distinct from m.instance_id) as mismatched_instance
from public.messages m
left join public.chats c on c.id = m.chat_id
group by m.workspace_id
order by m.workspace_id;

-- 5. Duplicatas preexistentes no escopo proposto (nao retorna mensagem ou dados pessoais).
-- Executar SO se a consulta 1 confirmar m.instance_id e m.external_id.
select count(*) as duplicate_scope_groups
from (
  select workspace_id, instance_id, external_id
  from public.messages
  where external_id is not null
  group by workspace_id, instance_id, external_id
  having count(*) > 1
) as duplicates;

-- 6. Confirmar funcoes e respectivas assinaturas antes de planejar substituicao atomica.
select p.oid::regprocedure::text as signature,
       pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('persist_inbox_message', 'mark_chat_read')
order by signature;
