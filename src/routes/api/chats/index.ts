import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { decodeCompositeCursor, encodeCompositeCursor } from "@/lib/pagination-cursor";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown, fallback: string) {
  return safePublicError(error, fallback);
}

function groupSubject(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const subject = (metadata as Record<string, unknown>)["subject"];
  return typeof subject === "string" && subject.trim() ? subject : null;
}

export const Route = createFileRoute("/api/chats/")({
  server: {
    handlers: {
      // Devolve as conversas salvas com as últimas mensagens (inclusive mídias)
      // APENAS de instâncias conectadas (status = 'open')
      GET: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        try {
          const url = new URL(request.url);
          const cursor = decodeCompositeCursor("chat", url.searchParams.get("cursor"));
          const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
          const limit = Math.min(Math.max(limitParam, 1), 1000);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Apenas conexões realmente abertas podem expor conversas. A
          // consulta de instâncias é um gate de segurança: qualquer falha
          // deve interromper a listagem, nunca cair em todos os chats do
          // workspace por acidente.
          const { data: allInstances, error: instancesError } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id, instance_name, status")
            .eq("workspace_id", auth.workspaceId)
            .eq("status", "open");

          if (instancesError)
            return json(
              { error: safePublicError(instancesError, "Erro ao carregar conexões") },
              500,
            );

          const instanceIds = (allInstances ?? []).map((instance) => instance.id);
          if (!instanceIds.length) return json({ chats: [], hasMore: false, nextCursor: null });

          // 2. Busca chats do workspace
          let query = supabaseAdmin.from("chats").select("*").eq("workspace_id", auth.workspaceId);
          query = query.in("instance_id", instanceIds);

          query = query
            .order("pinned", { ascending: false })
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .limit(limit + 1);

          if (cursor) {
            query = query.or(
              `pinned.lt.${cursor.pinned ? "true" : "false"},and(pinned.eq.${cursor.pinned ? "true" : "false"},last_message_at.lt.${cursor.timestamp}),and(pinned.eq.${cursor.pinned ? "true" : "false"},last_message_at.eq.${cursor.timestamp},id.lt.${cursor.id})`,
            );
          }

          const { data: chats, error } = await query;
          if (error)
            return json({ error: safePublicError(error, "Erro ao carregar conversas") }, 500);

          const hasMore = (chats?.length ?? 0) > limit;
          const page = hasMore ? (chats ?? []).slice(0, limit) : (chats ?? []);
          const chatIds = page.map((chat) => chat.id);
          const leadByChat = new Map<string, string>();
          const leadByContact = new Map<string, string>();
          const handoverByChat = new Map<
            string,
            { priority: string; requested_at: string; status: string }
          >();
          if (chatIds.length > 0) {
            const [{ data: leads, error: leadsError }, { data: handovers, error: handoverError }] =
              await Promise.all([
                supabaseAdmin
                  .from("crm_leads")
                  .select("id,chat_id,contact_id")
                  .eq("workspace_id", auth.workspaceId),
                supabaseAdmin
                  .from("handover_requests")
                  .select("chat_id,priority,requested_at,status")
                  .eq("workspace_id", auth.workspaceId)
                  .in("chat_id", chatIds)
                  .in("status", ["queued", "assigned", "in_progress"])
                  .order("requested_at", { ascending: false }),
              ]);
            if (leadsError)
              return json({ error: safePublicError(leadsError, "Falha ao consultar leads") }, 500);
            if (handoverError)
              return json(
                { error: safePublicError(handoverError, "Falha ao consultar handoffs") },
                500,
              );
            for (const lead of leads ?? []) {
              if (lead.chat_id) leadByChat.set(lead.chat_id, lead.id);
              if (lead.contact_id) leadByContact.set(lead.contact_id, lead.id);
            }
            for (const handover of handovers ?? []) {
              if (!handoverByChat.has(handover.chat_id))
                handoverByChat.set(handover.chat_id, handover);
            }
          }

          // Coleta telefones de conversas individuais para resolver nomes e fotos atualizadas da agenda
          const directPhones = [
            ...new Set(
              page
                .filter((c) => !c.is_group && c.phone)
                .map((c) => String(c.phone).replace(/\D/g, ""))
                .filter(Boolean),
            ),
          ];

          const contactNamesMap = new Map<
            string,
            { name: string; profile_pic_url: string | null }
          >();
          if (directPhones.length > 0) {
            const instanceIds = [
              ...new Set(
                page
                  .filter((chat) => !chat.is_group && chat.instance_id)
                  .map((chat) => String(chat.instance_id)),
              ),
            ];
            let contactsQuery = supabaseAdmin
              .from("whatsapp_contacts")
              .select(
                "id, phone, instance_id, remote_jid, alternate_jid, saved_name, push_name, profile_pic_url",
              )
              .eq("workspace_id", auth.workspaceId)
              .in("phone", directPhones);
            if (instanceIds.length > 0)
              contactsQuery = contactsQuery.in("instance_id", instanceIds);
            const { data: contacts } = await contactsQuery;

            for (const c of contacts ?? []) {
              const best = c.saved_name || c.push_name;
              const identities = [c.phone, c.remote_jid, c.alternate_jid]
                .filter(Boolean)
                .map((identity) => String(identity).replace(/\D/g, ""))
                .filter(Boolean);
              if (best || c.profile_pic_url) {
                for (const identity of identities) {
                  contactNamesMap.set(`${c.instance_id}:${identity}`, {
                    name: best || "",
                    profile_pic_url: c.profile_pic_url || null,
                  });
                }
              }
              if (c.id && c.instance_id && leadByContact.has(c.id) && c.phone) {
                leadByContact.set(
                  `${c.instance_id}:${c.phone.replace(/\D/g, "")}`,
                  leadByContact.get(c.id)!,
                );
              }
            }
          }

          const mapped = page
            .filter((chat) => {
              const isGroup = Boolean(chat.is_group);
              // GRUPOS DO WHATSAPP DEVEM SEMPRE SER EXIBIDOS AUTOMATICAMENTE
              if (isGroup) return true;

              const hasRealMessage =
                chat.last_message &&
                chat.last_message !== "Conversa iniciada" &&
                chat.last_message !== "Grupo sincronizado";
              const hasUnread = (chat.unread || 0) > 0;
              const isPinned = Boolean(chat.pinned);
              return hasRealMessage || hasUnread || isPinned;
            })
            .map((chat) => {
              const isGroup = Boolean(chat.is_group);
              const cleanPhoneDigits = String(chat.phone || "").replace(/\D/g, "");
              const leadId = isGroup
                ? null
                : (leadByChat.get(chat.id) ??
                  leadByContact.get(`${chat.instance_id}:${cleanPhoneDigits}`) ??
                  null);
              const lastMsg =
                chat.last_message || (isGroup ? "Grupo sincronizado" : "Conversa iniciada");
              const timestamp = chat.last_message_at || chat.created_at || null;
              const handover = handoverByChat.get(chat.id);
              const handoverAgeMinutes = handover
                ? Math.max(0, (Date.now() - new Date(handover.requested_at).getTime()) / 60000)
                : null;
              const handoverSla =
                handoverAgeMinutes === null
                  ? null
                  : handoverAgeMinutes >= 15
                    ? "overdue"
                    : handoverAgeMinutes >= 5
                      ? "attention"
                      : "pending";

              let resolvedChatName = chat.name;
              let resolvedChatPic = chat.profile_pic_url;

              if (isGroup) {
                const groupMetaSubject = groupSubject(chat.group_metadata);
                if (
                  groupMetaSubject &&
                  (!resolvedChatName || resolvedChatName === "Grupo WhatsApp")
                ) {
                  resolvedChatName = groupMetaSubject;
                }
              } else {
                const contactInfo = contactNamesMap.get(`${chat.instance_id}:${cleanPhoneDigits}`);
                if (
                  contactInfo?.name &&
                  (!resolvedChatName || /^\+?[\d\s\-()]+$/.test(resolvedChatName.trim()))
                ) {
                  resolvedChatName = contactInfo.name;
                }
                if (!resolvedChatPic && contactInfo?.profile_pic_url) {
                  resolvedChatPic = contactInfo.profile_pic_url;
                }
              }

              return {
                id: chat.id,
                phone: chat.phone,
                name: resolvedChatName,
                profilePicUrl: resolvedChatPic,
                // Keep the canonical identity available to realtime presence
                // consumers; instance_name is only a display/provider label.
                instanceId: chat.instance_id,
                instanceName: chat.instance_name,
                lastMessage: lastMsg,
                lastMessageType: chat.last_message_type || "text",
                timestamp,
                unread: chat.unread || 0,
                ai_paused: chat.ai_paused || false,
                pinned: Boolean(chat.pinned),
                archived: Boolean(chat.archived),
                tag: chat.tag ?? null,
                isGroup,
                isAnnouncement: Boolean(chat.is_announcement),
                canSend: chat.can_send !== undefined ? Boolean(chat.can_send) : true,
                isAdmin: Boolean(chat.is_admin),
                leadId,
                contactCategory: isGroup ? "group" : leadId ? "lead" : "personal",
                humanHandoff: Boolean(handover),
                handoverPriority: handover?.priority ?? null,
                handoverRequestedAt: handover?.requested_at ?? null,
                handoverSla,
                handoverStatus: handover?.status ?? null,
              };
            });
          const last = page.at(-1);
          return json({
            chats: mapped,
            hasMore,
            nextCursor:
              hasMore && last
                ? encodeCompositeCursor("chat", {
                    pinned: Boolean(last.pinned),
                    timestamp: last.last_message_at || last.created_at,
                    id: last.id,
                  })
                : null,
          });
        } catch (err: unknown) {
          return json({ error: errorMessage(err, "Erro ao carregar conversas") }, 500);
        }
      },
    },
  },
});
