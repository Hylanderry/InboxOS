/** The actual live PostgreSQL unique constraint on whatsapp_contacts.
 * Do not replace instance_id with instance_name: it produces Postgres 42P10
 * and was responsible for thousands of failed Evolution contact events.
 */
export const WHATSAPP_CONTACTS_ON_CONFLICT = "workspace_id,instance_id,remote_jid" as const;

/** Actual unique key on whatsapp_presence (live Supabase, 2026-10-02). */
export const WHATSAPP_PRESENCE_ON_CONFLICT = "workspace_id,instance_id,phone" as const;
