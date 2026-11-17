import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiPermission } from "@/server/middleware/auth";
import { cleanPhone } from "@/lib/evolution.server";
import { WHATSAPP_CONTACTS_ON_CONFLICT } from "@/server/evolution/schema-contract";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const importItemSchema = z
  .object({
    phone: z.unknown().optional(),
    telefone: z.unknown().optional(),
    number: z.unknown().optional(),
    id: z.unknown().optional(),
    remoteJid: z.unknown().optional(),
    name: z.unknown().optional(),
    nome: z.unknown().optional(),
    contactName: z.unknown().optional(),
    saved_name: z.unknown().optional(),
    pushName: z.unknown().optional(),
    instanceName: z.unknown().optional(),
    instance_name: z.unknown().optional(),
    isGroup: z.unknown().optional(),
    is_group: z.unknown().optional(),
    profilePicUrl: z.unknown().optional(),
    profile_pic_url: z.unknown().optional(),
    avatar: z.unknown().optional(),
    photo: z.unknown().optional(),
    isSaved: z.unknown().optional(),
    is_saved: z.unknown().optional(),
  })
  .passthrough();

export const Route = createFileRoute("/api/sync/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "instances.manage");
        if (auth instanceof Response) return auth;

        const rawPayload = await request.json().catch(() => null);
        const rawItems = Array.isArray(rawPayload)
          ? rawPayload
          : Array.isArray(rawPayload?.contacts)
            ? rawPayload.contacts
            : Array.isArray(rawPayload?.chats)
              ? rawPayload.chats
              : [];
        const parsedItems = z.array(importItemSchema).max(10_000).safeParse(rawItems);
        if (!parsedItems.success || parsedItems.data.length === 0) {
          return json(
            { success: false, error: "Nenhum contato ou conversa válida para importar" },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: instances, error: instancesError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("id,instance_name,status")
          .eq("workspace_id", auth.workspaceId);
        if (instancesError)
          return json({ success: false, error: "Falha ao validar conexões" }, 500);

        const ownedInstances = new Map((instances ?? []).map((item) => [item.instance_name, item]));
        const defaultInstance =
          (instances ?? []).find((item) => item.status === "open") ??
          ((instances ?? []).length === 1 ? instances![0] : null);
        const contacts = new Map<string, Record<string, unknown>>();
        const groups = new Map<string, Record<string, unknown>>();
        let rejected = 0;

        for (const item of parsedItems.data) {
          const rawIdentifier = String(
            item.remoteJid ?? item.phone ?? item.telefone ?? item.number ?? item.id ?? "",
          ).trim();
          const phone = cleanPhone(rawIdentifier);
          const requestedInstance = String(item.instanceName ?? item.instance_name ?? "").trim();
          const instance = requestedInstance
            ? ownedInstances.get(requestedInstance)
            : defaultInstance;
          if (!phone || !instance) {
            rejected++;
            continue;
          }

          const isGroup =
            Boolean(item.isGroup ?? item.is_group) || rawIdentifier.toLowerCase().endsWith("@g.us");
          const remoteJid = isGroup
            ? rawIdentifier.endsWith("@g.us")
              ? rawIdentifier
              : `${phone}@g.us`
            : rawIdentifier.includes("@")
              ? rawIdentifier
              : `${phone}@s.whatsapp.net`;
          const nameValue =
            item.name ?? item.nome ?? item.contactName ?? item.saved_name ?? item.pushName ?? null;
          const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : null;
          const pictureValue =
            item.profilePicUrl ?? item.profile_pic_url ?? item.avatar ?? item.photo ?? null;
          const profilePic =
            typeof pictureValue === "string" && /^https?:\/\//i.test(pictureValue)
              ? pictureValue
              : null;
          const identityKind = isGroup ? "group" : remoteJid.endsWith("@lid") ? "lid" : "phone";

          contacts.set(`${instance.id}:${remoteJid}`, {
            workspace_id: auth.workspaceId,
            instance_id: instance.id,
            instance_name: instance.instance_name,
            remote_jid: remoteJid,
            alternate_jid: remoteJid,
            identity_kind: identityKind,
            phone,
            saved_name: name,
            push_name: name,
            profile_pic_url: profilePic,
            is_saved:
              typeof (item.isSaved ?? item.is_saved) === "boolean"
                ? Boolean(item.isSaved ?? item.is_saved)
                : false,
            updated_at: new Date().toISOString(),
          });

          if (isGroup) {
            groups.set(`${instance.id}:${remoteJid}`, {
              workspace_id: auth.workspaceId,
              instance_id: instance.id,
              instance_name: instance.instance_name,
              phone,
              remote_jid: remoteJid,
              identity_kind: "group",
              name,
              profile_pic_url: profilePic,
              is_group: true,
              unread: 0,
              archived: false,
              pinned: false,
              last_message: "Grupo sincronizado",
              last_message_type: "text",
              last_message_at: new Date().toISOString(),
            });
          }
        }

        const contactRows = [...contacts.values()];
        const groupRows = [...groups.values()];
        if (contactRows.length === 0) {
          return json(
            { success: false, error: "Nenhuma identidade válida para uma conexão deste workspace" },
            400,
          );
        }

        for (let start = 0; start < contactRows.length; start += 500) {
          const { error } = await supabaseAdmin
            .from("whatsapp_contacts")
            .upsert(contactRows.slice(start, start + 500) as never[], {
              onConflict: WHATSAPP_CONTACTS_ON_CONFLICT,
            });
          if (error)
            return json(
              { success: false, error: safePublicError(error, "Falha ao importar contatos") },
              500,
            );
        }
        for (let start = 0; start < groupRows.length; start += 300) {
          const batch = groupRows.slice(start, start + 300);
          const { data: existingGroups, error: existingGroupsError } = await supabaseAdmin
            .from("chats")
            .select("id,remote_jid,instance_id")
            .eq("workspace_id", auth.workspaceId)
            .in(
              "remote_jid",
              batch.map((row) => String(row["remote_jid"])),
            );
          if (existingGroupsError)
            return json(
              {
                success: false,
                error: safePublicError(existingGroupsError, "Falha ao consultar grupos"),
              },
              500,
            );
          const existingByKey = new Map(
            (existingGroups ?? []).map((row) => [
              `${row["instance_id"]}:${row["remote_jid"]}`,
              row.id,
            ]),
          );
          const rowsWithIds = batch.map((row) => ({
            ...row,
            id:
              existingByKey.get(`${String(row["instance_id"])}:${String(row["remote_jid"])}`) ??
              crypto.randomUUID(),
          }));
          const { error } = await supabaseAdmin
            .from("chats")
            .upsert(rowsWithIds as never[], { onConflict: "id" });
          if (error)
            return json(
              { success: false, error: safePublicError(error, "Falha ao importar conversas") },
              500,
            );
        }

        // Propaga nomes de contatos individuais importados para conversas existentes
        for (const contact of contactRows) {
          const contactPhone = typeof contact["phone"] === "string" ? contact["phone"] : null;
          const savedName =
            typeof contact["saved_name"] === "string" ? contact["saved_name"] : null;
          const instanceName =
            typeof contact["instance_name"] === "string" ? contact["instance_name"] : null;
          const profilePicUrl =
            typeof contact["profile_pic_url"] === "string" ? contact["profile_pic_url"] : null;

          if (contactPhone && savedName && instanceName) {
            await supabaseAdmin
              .from("chats")
              .update({
                name: savedName,
                ...(profilePicUrl ? { profile_pic_url: profilePicUrl } : {}),
              })
              .eq("workspace_id", auth.workspaceId)
              .eq("instance_name", instanceName)
              .eq("phone", contactPhone);
          }
        }

        return json({
          success: true,
          contactsImported: contactRows.length,
          groupsImported: groupRows.length,
          rejected,
          totalSubmitted: parsedItems.data.length,
        });
      },
    },
  },
});
