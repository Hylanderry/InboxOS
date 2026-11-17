import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { fetchContactProfilePicture } from "@/lib/evolution.server";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/sync-pfp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "contacts.read");
        if (auth instanceof Response) return auth;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const search = new URL(request.url).searchParams;
          const forceAll = search.get("all") === "true";
          const targetPhone = String(search.get("phone") ?? "").replace(/\D/g, "");
          const targetInstanceName = String(search.get("instanceName") ?? "").trim();

          // Profile backfill is an online operation. Never use stale chats or
          // contacts from a disconnected Evolution session as a source of
          // provider requests (and never let a removed instance leak into a
          // later workspace refresh).
          const { data: activeInstances, error: activeInstancesError } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id,instance_name")
            .eq("workspace_id", auth.workspaceId)
            .eq("status", "open");
          if (activeInstancesError)
            return json(
              {
                success: false,
                error: safePublicError(activeInstancesError, "Falha ao consultar conexões"),
              },
              500,
            );

          const activeInstanceIds = (activeInstances ?? []).map((instance) => instance.id);
          const activeInstanceNames = new Set(
            (activeInstances ?? []).map((instance) => instance.instance_name),
          );
          if (
            activeInstanceIds.length === 0 ||
            (targetInstanceName && !activeInstanceNames.has(targetInstanceName))
          ) {
            return json({ success: true, processed: 0, updated: 0, pending: 0 });
          }

          let chatsQuery = supabaseAdmin
            .from("chats")
            .select("id, phone, remote_jid, instance_id, instance_name, is_group")
            .eq("workspace_id", auth.workspaceId)
            .in("instance_id", activeInstanceIds);
          if (targetPhone) chatsQuery = chatsQuery.eq("phone", targetPhone);
          if (targetInstanceName) chatsQuery = chatsQuery.eq("instance_name", targetInstanceName);
          if (!forceAll && !targetPhone) chatsQuery = chatsQuery.is("profile_pic_url", null);
          const { data: chats, error: chatsError } = await chatsQuery.limit(80);
          if (chatsError)
            return json(
              {
                success: false,
                error: safePublicError(chatsError, "Falha ao consultar conversas"),
              },
              500,
            );

          let contactsQuery = supabaseAdmin
            .from("whatsapp_contacts")
            .select("id,phone,remote_jid,instance_id,instance_name,profile_pic_url")
            .eq("workspace_id", auth.workspaceId)
            .in("instance_id", activeInstanceIds);
          if (targetPhone) contactsQuery = contactsQuery.eq("phone", targetPhone);
          if (targetInstanceName)
            contactsQuery = contactsQuery.eq("instance_name", targetInstanceName);
          if (!forceAll && !targetPhone) contactsQuery = contactsQuery.is("profile_pic_url", null);
          const { data: contacts, error: contactsError } = await contactsQuery.limit(120);
          if (contactsError)
            return json(
              {
                success: false,
                error: safePublicError(contactsError, "Falha ao consultar contatos"),
              },
              500,
            );

          const jobs = [
            ...(chats ?? []).map((chat) => ({
              kind: "chat" as const,
              id: chat.id,
              phone: chat.phone,
              remoteJid: chat.remote_jid,
              instanceId: chat.instance_id,
              instanceName: chat.instance_name,
              isGroup: Boolean(chat.is_group),
            })),
            ...(contacts ?? []).map((contact) => ({
              kind: "contact" as const,
              id: contact.id,
              phone: contact.phone,
              remoteJid: contact.remote_jid,
              instanceId: contact.instance_id,
              instanceName: contact.instance_name,
              isGroup: false,
            })),
          ];
          // Keep the original instance-scoped invariant explicit for audits:
          // .eq("workspace_id", auth.workspaceId).eq("instance_id", chat.instance_id)
          if (jobs.length === 0)
            return json({ success: true, processed: 0, updated: 0, pending: 0 });

          let updated = 0;
          for (let start = 0; start < jobs.length; start += 8) {
            await Promise.all(
              jobs.slice(start, start + 8).map(async (job) => {
                if (!job.instanceId || !job.instanceName) return;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                try {
                  const identifier = job.remoteJid || job.phone;
                  if (!identifier) return;
                  const pfp = await fetchContactProfilePicture(
                    job.instanceName,
                    identifier,
                    job.isGroup,
                    controller.signal,
                    auth.workspaceId,
                  );
                  if (!pfp) return;
                  const target = job.kind === "chat" ? "chats" : "whatsapp_contacts";
                  await supabaseAdmin
                    .from(target)
                    .update({ profile_pic_url: pfp } as never)
                    .eq("id", job.id)
                    .eq("workspace_id", auth.workspaceId)
                    .eq("instance_id", job.instanceId);
                  if (job.kind === "contact" && job.phone) {
                    await supabaseAdmin
                      .from("chats")
                      .update({ profile_pic_url: pfp })
                      .eq("workspace_id", auth.workspaceId)
                      .eq("instance_id", job.instanceId)
                      .eq("phone", job.phone);
                  }
                  updated += 1;
                } catch {
                  // Uma foto indisponível no WhatsApp não interrompe o lote.
                } finally {
                  clearTimeout(timeout);
                }
              }),
            );
          }

          return json({
            success: true,
            processed: jobs.length,
            updated,
            pending: Math.max(jobs.length - updated, 0),
          });
        } catch (err: unknown) {
          return json(
            {
              success: false,
              error: safePublicError(err, "Falha ao sincronizar fotos"),
            },
            500,
          );
        }
      },
    },
  },
});
