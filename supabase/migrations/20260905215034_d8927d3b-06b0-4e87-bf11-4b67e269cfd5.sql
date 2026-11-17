CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone TEXT,
  profile_pic_url TEXT,
  qr_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  profile_pic_url TEXT,
  last_message TEXT,
  last_message_type TEXT NOT NULL DEFAULT 'text',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread INTEGER NOT NULL DEFAULT 0,
  ai_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_name, phone)
);

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  external_id TEXT,
  sender TEXT NOT NULL DEFAULT 'client' CHECK (sender IN ('client','agent','system')),
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','audio','document','sticker')),
  text TEXT,
  media_url TEXT,
  media_mimetype TEXT,
  media_filename TEXT,
  media_duration INTEGER,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_chat_id ON public.messages(chat_id, created_at);
CREATE INDEX idx_chats_last_message_at ON public.chats(last_message_at DESC);
CREATE UNIQUE INDEX idx_messages_external_id ON public.messages(external_id) WHERE external_id IS NOT NULL;

GRANT SELECT ON public.whatsapp_instances TO anon, authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
GRANT SELECT ON public.chats TO anon, authenticated;
GRANT ALL ON public.chats TO service_role;
GRANT SELECT ON public.messages TO anon, authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instances are viewable by everyone" ON public.whatsapp_instances FOR SELECT USING (true);
CREATE POLICY "Chats are viewable by everyone" ON public.chats FOR SELECT USING (true);
CREATE POLICY "Messages are viewable by everyone" ON public.messages FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;