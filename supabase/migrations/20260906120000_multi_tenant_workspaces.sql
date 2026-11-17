-- ==============================================================================
-- Migração Multi-Tenant: Workspaces, Membros, Isolamento de Instâncias e Mensagens
-- ==============================================================================

-- 1. Tabela de Workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de Membros do Workspace
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('owner', 'admin', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

-- 3. Workspace padrão para garantir migração segura dos dados legados
INSERT INTO public.workspaces (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Workspace Principal', 'default')
ON CONFLICT (id) DO NOTHING;

-- 4. Adicionar workspace_id em whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.whatsapp_instances
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

ALTER TABLE public.whatsapp_instances
  ALTER COLUMN workspace_id SET NOT NULL;

-- Atualizar unicidade de instância para ser por workspace
ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_instance_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_instances_workspace_instance_key'
  ) THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_workspace_instance_key UNIQUE (workspace_id, instance_name);
  END IF;
END $$;

-- 5. Adicionar workspace_id em chats
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.chats
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

ALTER TABLE public.chats
  ALTER COLUMN workspace_id SET NOT NULL;

-- Remover unicidade global antiga (instance_name, phone) e criar composta com workspace_id
ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_instance_name_phone_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chats_workspace_instance_phone_key'
  ) THEN
    ALTER TABLE public.chats
      ADD CONSTRAINT chats_workspace_instance_phone_key UNIQUE (workspace_id, instance_name, phone);
  END IF;
END $$;

-- 6. Adicionar workspace_id e client_message_id em messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_message_id UUID;

-- Atualiza workspace_id das mensagens a partir do chat correspondente
UPDATE public.messages m
SET workspace_id = c.workspace_id
FROM public.chats c
WHERE m.chat_id = c.id AND m.workspace_id IS NULL;

UPDATE public.messages
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN workspace_id SET NOT NULL;

-- Substituir índice único global de external_id por índice composto com workspace_id
DROP INDEX IF EXISTS public.idx_messages_external_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_workspace_external
  ON public.messages (workspace_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_workspace_client_msg_id
  ON public.messages (workspace_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chats_workspace_last_message
  ON public.chats (workspace_id, last_message_at DESC);

-- 7. Função auxiliar de segurança RLS: conferir se o usuário autenticado pertence ao workspace
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(target_workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 8. Políticas RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read workspaces" ON public.workspaces;
CREATE POLICY "Members can read workspaces"
  ON public.workspaces FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(id));

DROP POLICY IF EXISTS "Members can read workspace members" ON public.workspace_members;
CREATE POLICY "Members can read workspace members"
  ON public.workspace_members FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

-- Atualizar RLS de instâncias, chats e mensagens com validação de workspace
DROP POLICY IF EXISTS "Authenticated users can read chats" ON public.chats;
CREATE POLICY "Authenticated users can read chats"
  ON public.chats FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.messages;
CREATE POLICY "Authenticated users can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated users can read instances" ON public.whatsapp_instances;
CREATE POLICY "Authenticated users can read instances"
  ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (public.user_has_workspace_access(workspace_id));

-- Garantir acesso irrestrito ao service_role para operações administrativas do servidor
GRANT ALL ON public.workspaces TO service_role;
GRANT ALL ON public.workspace_members TO service_role;
GRANT ALL ON public.whatsapp_instances TO service_role;
GRANT ALL ON public.chats TO service_role;
GRANT ALL ON public.messages TO service_role;
