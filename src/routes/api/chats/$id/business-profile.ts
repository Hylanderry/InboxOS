import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import { fetchBusinessProfile, fetchContactProfilePicture } from "@/lib/evolution.server";
import { isValidPhone, cleanPhone } from "@/lib/conversationKey";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chats/$id/business-profile")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = await requireApiPermission(request, "messages.read");
        if (auth instanceof Response) return auth;

        const chatId = params.id;
        if (!chatId) return json({ error: "Chat ID obrigatório" }, 400);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Busca dados da conversa
          const { data: chat, error } = await supabaseAdmin
            .from("chats")
            .select("id, phone, name, instance_name, is_group, profile_pic_url")
            .eq("id", chatId)
            .eq("workspace_id", auth.workspaceId)
            .maybeSingle();

          if (error || !chat) {
            return json({ error: "Conversa não encontrada" }, 404);
          }

          if (chat.is_group) {
            return json({ isBusiness: false, isGroup: true });
          }

          let realPhone = cleanPhone(chat.phone);
          let realName = chat.name;
          let realPicUrl = chat.profile_pic_url;

          // Se o telefone armazenado for um LID (ex: 15 dígitos) ou inválido, tenta resolver no whatsapp_contacts
          const { data: contactRow } = await supabaseAdmin
            .from("whatsapp_contacts")
            .select("phone, saved_name, push_name, profile_pic_url, alternate_jid")
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_name", chat.instance_name)
            .or(
              `phone.eq.${realPhone},remote_jid.eq.${realPhone}@lid,remote_jid.ilike.%${realPhone}%,alternate_jid.ilike.%${realPhone}%`,
            )
            .limit(1)
            .maybeSingle();

          if (contactRow) {
            if (contactRow.phone && isValidPhone(contactRow.phone)) {
              realPhone = contactRow.phone;
            } else if (contactRow.alternate_jid) {
              const altClean = cleanPhone(contactRow.alternate_jid);
              if (isValidPhone(altClean)) realPhone = altClean;
            }

            if (contactRow.saved_name) {
              realName = contactRow.saved_name;
            } else if (contactRow.push_name && (!realName || realName.startsWith("+"))) {
              realName = contactRow.push_name;
            }

            if (contactRow.profile_pic_url) {
              realPicUrl = contactRow.profile_pic_url;
            }
          }

          // Se ainda não tiver foto de perfil, tenta buscar via Evolution API
          if (!realPicUrl && isValidPhone(realPhone)) {
            const fetchedPic = await fetchContactProfilePicture(
              chat.instance_name,
              realPhone,
              undefined,
              undefined,
              auth.workspaceId,
            );
            if (fetchedPic) {
              realPicUrl = fetchedPic;
            }
          }

          // Atualiza o registro no Supabase se houver correções (ex: LID corrigido para telefone E.164, nome ou foto)
          const updates: { phone?: string; name?: string; profile_pic_url?: string } = {};
          if (realPhone !== chat.phone && isValidPhone(realPhone)) {
            updates.phone = realPhone;
          }
          if (realName && realName !== chat.name) {
            updates.name = realName;
          }
          if (realPicUrl && realPicUrl !== chat.profile_pic_url) {
            updates.profile_pic_url = realPicUrl;
          }

          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from("chats").update(updates).eq("id", chat.id);
          }

          const profile = isValidPhone(realPhone)
            ? await fetchBusinessProfile(chat.instance_name, realPhone)
            : null;

          return json({
            success: true,
            chatId: chat.id,
            name: realName || chat.name,
            phone: realPhone,
            profilePicUrl: realPicUrl || null,
            profile: profile || { isBusiness: false },
          });
        } catch (err: unknown) {
          return json({ error: safePublicError(err, "Erro ao carregar perfil") }, 500);
        }
      },
    },
  },
});
