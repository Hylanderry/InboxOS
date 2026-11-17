-- ==============================================================================
-- Migração: Suporte a Grupos e Permissões de Envio de Administradores
-- ==============================================================================

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_metadata JSONB DEFAULT '{}'::jsonb;

-- Índice para filtrar grupos com rapidez
CREATE INDEX IF NOT EXISTS idx_chats_is_group_announce ON public.chats(is_group, is_announcement);
