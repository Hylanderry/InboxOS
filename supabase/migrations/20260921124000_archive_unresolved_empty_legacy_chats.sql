-- Keep unresolved legacy rows for audit, but hide empty records that no longer
-- correspond to a contact returned by the connected WhatsApp instance.

update public.chats c
set archived = true,
    updated_at = now()
where c.instance_id is not null
  and c.remote_jid is null
  and c.is_group = false
  and not exists (
    select 1 from public.messages m where m.chat_id = c.id
  )
  and not exists (
    select 1
    from public.whatsapp_contacts wc
    where wc.workspace_id = c.workspace_id
      and wc.instance_name = c.instance_name
      and wc.phone = c.phone
  );
