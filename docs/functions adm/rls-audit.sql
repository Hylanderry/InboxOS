-- Consultas SOMENTE LEITURA para executar no SQL Editor de staging.
-- Não contém segredos e não modifica dados.

select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rowsecurity,
  c.relforcerowsecurity as forcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'system_user_controls','system_admins','system_admin_audit_log',
    'system_integrations','system_integration_secrets',
    'newsletter_campaigns','newsletter_media_assets',
    'workspace_invitations','user_devices','user_sessions',
    'workspaces','workspace_members','whatsapp_instances','chats',
    'messages','whatsapp_contacts','whatsapp_presence','evolution_events',
    'outbound_messages','inbox_events'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'system_user_controls','system_admins','system_admin_audit_log',
    'system_integrations','system_integration_secrets',
    'newsletter_campaigns','newsletter_media_assets',
    'workspace_invitations','user_devices','user_sessions',
    'workspaces','workspace_members','whatsapp_instances','chats',
    'messages','whatsapp_contacts','whatsapp_presence','evolution_events',
    'outbound_messages','inbox_events'
  )
order by tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role')
  and table_name in (
    'system_user_controls','system_admins','system_admin_audit_log',
    'system_integrations','system_integration_secrets',
    'newsletter_campaigns','newsletter_media_assets',
    'workspace_invitations','user_devices','user_sessions'
  )
order by table_name, grantee, privilege_type;

select routine_schema, routine_name, security_type, specific_name
from information_schema.routines
where routine_schema in ('public','private')
  and routine_name in (
    'claim_system_admin_bootstrap','persist_inbox_message','mark_chat_read',
    'user_has_workspace_access','transfer_workspace_ownership'
  )
order by routine_schema, routine_name;
