ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_phone text;
