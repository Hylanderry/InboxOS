ALTER TABLE public.messages
  ADD CONSTRAINT messages_workspace_external_key UNIQUE (workspace_id, external_id);
