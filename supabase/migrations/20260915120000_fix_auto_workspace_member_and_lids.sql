-- Ensure all authenticated users are granted membership to default workspace
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', u.id, 'agent'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = u.id
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Update trigger function so future signups automatically get workspace access
CREATE OR REPLACE FUNCTION private.bootstrap_first_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  has_owner boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_first_workspace_owner'));
  
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE role = 'owner'
  ) INTO has_owner;

  IF NOT has_owner THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES ('00000000-0000-0000-0000-000000000001', new.id, 'owner')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES ('00000000-0000-0000-0000-000000000001', new.id, 'agent')
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_first_workspace_owner ON auth.users;
CREATE TRIGGER bootstrap_first_workspace_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.bootstrap_first_workspace_owner();

-- Optimization indices for LID lookups and contact resolution
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_remote_jid
  ON public.whatsapp_contacts (workspace_id, instance_name, remote_jid);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone_lookup
  ON public.whatsapp_contacts (workspace_id, instance_name, phone);
