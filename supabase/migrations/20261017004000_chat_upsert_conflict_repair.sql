-- Runtime repair for group synchronization.
--
-- The group sync uses the composite identity (workspace, instance, remote JID).
-- A partial unique index cannot be inferred by PostgREST's upsert conflict
-- target, so keep a complete unique index as the durable schema contract.
-- NULL values remain allowed by PostgreSQL's normal UNIQUE semantics.
-- This is additive and intentionally does not delete or merge duplicate data;
-- if duplicates already exist, resolve them explicitly before applying this
-- migration instead of silently discarding messages or chats.
create unique index if not exists chats_workspace_instance_remote_jid_full_uidx
  on public.chats(workspace_id, instance_id, remote_jid);
