ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tag TEXT,
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chats_archived ON public.chats(archived);
CREATE INDEX IF NOT EXISTS idx_chats_is_group ON public.chats(is_group);