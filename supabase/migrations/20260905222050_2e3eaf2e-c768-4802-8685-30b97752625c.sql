-- 1. Remove leitura pública das tabelas sensíveis
DROP POLICY IF EXISTS "Chats are viewable by everyone" ON public.chats;
DROP POLICY IF EXISTS "Messages are viewable by everyone" ON public.messages;
DROP POLICY IF EXISTS "Instances are viewable by everyone" ON public.whatsapp_instances;

REVOKE ALL ON public.chats FROM anon;
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.whatsapp_instances FROM anon;

GRANT SELECT ON public.chats TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.whatsapp_instances TO authenticated;

GRANT ALL ON public.chats TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.whatsapp_instances TO service_role;

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chats"
  ON public.chats FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read messages"
  ON public.messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read instances"
  ON public.whatsapp_instances FOR SELECT TO authenticated USING (true);

-- 2. Mídias: somente o servidor do painel (service role) acessa o bucket privado
DROP POLICY IF EXISTS "chat_media_service_read" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_service_write" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_service_update" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_service_delete" ON storage.objects;

CREATE POLICY "chat_media_service_read"
  ON storage.objects FOR SELECT TO service_role
  USING (bucket_id = 'chat-media');

CREATE POLICY "chat_media_service_write"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat_media_service_update"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'chat-media') WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "chat_media_service_delete"
  ON storage.objects FOR DELETE TO service_role
  USING (bucket_id = 'chat-media');