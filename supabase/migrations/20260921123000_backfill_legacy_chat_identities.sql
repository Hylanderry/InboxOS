-- Reconcile chats created by older imports before instance/JID identity columns existed.
-- Existing messages, unread counters and chat ids are preserved.

update public.chats c
set instance_id = i.id
from public.whatsapp_instances i
where c.instance_id is null
  and i.workspace_id = c.workspace_id
  and i.instance_name = c.instance_name;

with contact_matches as (
  select distinct on (c.id)
    c.id as chat_id,
    wc.remote_jid,
    wc.identity_kind,
    wc.phone
  from public.chats c
  join public.whatsapp_contacts wc
    on wc.workspace_id = c.workspace_id
   and wc.instance_name = c.instance_name
   and wc.phone = c.phone
  where c.remote_jid is null
  order by c.id, wc.updated_at desc, wc.id
)
update public.chats c
set remote_jid = matched.remote_jid,
    identity_kind = coalesce(matched.identity_kind,
      case when matched.remote_jid like '%@lid' then 'lid' else 'phone' end),
    phone_e164 = case
      when matched.remote_jid like '%@s.whatsapp.net' then matched.phone
      else c.phone_e164
    end,
    updated_at = now()
from contact_matches matched
where c.id = matched.chat_id;

update public.messages m
set instance_id = c.instance_id,
    remote_jid = c.remote_jid,
    updated_at = now()
from public.chats c
where m.chat_id = c.id
  and (m.instance_id is null or m.remote_jid is null)
  and c.instance_id is not null;
