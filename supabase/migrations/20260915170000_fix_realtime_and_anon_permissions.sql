-- Fix table select privileges for anon and authenticated roles and add tables to supabase_realtime publication
GRANT SELECT ON public.whatsapp_presence TO anon, authenticated, service_role;
GRANT SELECT ON public.whatsapp_contacts TO anon, authenticated, service_role;
GRANT SELECT ON public.chats TO anon, authenticated, service_role;
GRANT SELECT ON public.messages TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'whatsapp_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_presence;
  END IF;
END $$;
