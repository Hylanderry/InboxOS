ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_avatar text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS quoted_message jsonb;
