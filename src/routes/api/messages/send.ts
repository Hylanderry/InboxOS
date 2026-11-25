import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";
import {
  cleanPhone,
  evolutionFetch,
  mediaTypeFromMime,
  persistMessage,
  storeBase64Media,
  base64ToBytes,
  MAX_MEDIA_BYTES,
  recordGroupMetadata,
} from "@/lib/evolution.server";
import { isValidPhone, isLidIdentifier } from "@/lib/conversationKey";
import { buildMessageDestination } from "@/server/evolution/message-destination";
import {
  decideOutboundAttempt,
  isAmbiguousEvolutionSendFailure,
  type OutboundStatus,
} from "@/server/evolution/outbound-policy";
import { z } from "zod";
import { logServerError } from "@/server/logging";
import { safePublicError } from "@/server/public-error";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return safePublicError(error, fallback);
}

const sendPayloadSchema = z.object({
  instanceName: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(1).max(80),
  text: z.string().max(65_536).optional(),
  media: z.string().optional(),
  mediaPath: z.string().max(500).optional(),
  mimetype: z.string().max(255).optional(),
  fileName: z.string().max(500).optional(),
  type: z.enum(["image", "video", "audio", "document", "sticker"]).optional(),
  duration: z.number().int().min(0).max(86_400).optional(),
  clientMessageId: z.string().uuid().optional(),
  quotedMessageId: z.string().max(255).optional(),
  quotedMessage: z.unknown().optional(),
  isGroup: z.boolean().optional(),
});
type SendPayload = z.infer<typeof sendPayloadSchema>;
type EvolutionSendResponse = { key?: { id?: string } };

export const Route = createFileRoute("/api/messages/send")({
  server: {
    handlers: {
      // Envia texto, foto, vídeo, áudio ou documento pela Evolution API
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.send");
        if (auth instanceof Response) return auth;

        let payload: SendPayload;
        try {
          payload = sendPayloadSchema.parse(await request.json());
        } catch (error) {
          return json(
            {
              success: false,
              error: error instanceof z.ZodError ? "Campos de envio inválidos" : "Corpo inválido",
            },
            400,
          );
        }
        const clientMessageId = payload.clientMessageId ?? crypto.randomUUID();

        const rawPhone = String(payload.phone || "");
        let phone = cleanPhone(rawPhone);
        if (!phone)
          return json({ success: false, error: "Telefone do destinatário é obrigatório" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let isGroup = rawPhone.endsWith("@g.us") || Boolean(payload.isGroup);

        // Resolve the target connection before healing a LID. The same phone
        // may exist in more than one Evolution instance in this workspace.
        let instanceName = (payload.instanceName ?? "").trim();
        if (!instanceName) {
          // Sem conexão explícita só é seguro inferir quando há exatamente uma ativa no
          // workspace; com várias, escolher uma sozinho enviaria pelo número errado.
          const { data: openInstances } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("workspace_id", auth.workspaceId)
            .eq("status", "open")
            .limit(2);
          if ((openInstances?.length ?? 0) > 1) {
            return json(
              { success: false, error: "Escolha a conexão de WhatsApp para enviar a mensagem" },
              400,
            );
          }
          instanceName = openInstances?.[0]?.instance_name ?? "";
        }
        if (!instanceName) {
          return json({ success: false, error: "Nenhuma conexão de WhatsApp disponível" }, 400);
        }

        // Se não for grupo e o telefone for um LID (ex: 15 dígitos), tenta resolver no whatsapp_contacts
        if (!isGroup && (!isValidPhone(phone) || phone.length >= 15)) {
          // O valor entra num filtro PostgREST: remover vírgulas/parênteses evita injeção de condições.
          const safeRawJid = rawPhone.replace(/[^0-9A-Za-z@._-]/g, "");
          const { data: contactRow } = await supabaseAdmin
            .from("whatsapp_contacts")
            .select("phone, alternate_jid")
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_name", instanceName)
            .or(
              `remote_jid.eq.${safeRawJid},remote_jid.eq.${phone}@lid,remote_jid.ilike.%${phone}%,alternate_jid.ilike.%${phone}%`,
            )
            .limit(1)
            .maybeSingle();

          if (contactRow?.phone && isValidPhone(contactRow.phone)) {
            phone = contactRow.phone;
          } else if (contactRow?.alternate_jid) {
            const altClean = cleanPhone(contactRow.alternate_jid);
            if (isValidPhone(altClean)) phone = altClean;
          }
        }

        const { data: ownedInstance, error: instanceError } = await supabaseAdmin
          .from("whatsapp_instances")
          .select("instance_name,status")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName)
          .maybeSingle();
        if (instanceError || !ownedInstance) {
          return json({ success: false, error: "Conexão não pertence a este workspace" }, 403);
        }
        if (ownedInstance.status !== "open") {
          return json({ success: false, error: "A conexão do WhatsApp não está aberta" }, 409);
        }

        const { data: chatRow, error: chatError } = await supabaseAdmin
          .from("chats")
          .select(
            "id,instance_id,remote_jid,phone_e164,identity_kind,is_group,is_announcement,can_send",
          )
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_name", instanceName)
          .eq("phone", phone)
          .maybeSingle();
        if (chatError)
          return json(
            { success: false, error: errorMessage(chatError, "Falha ao consultar a conversa") },
            500,
          );
        if (!chatRow?.id || !chatRow.instance_id) {
          return json({ success: false, error: "Conversa não encontrada nesta conexão" }, 404);
        }
        if (chatRow?.is_group) isGroup = true;
        if (isGroup && chatRow?.can_send === false) {
          return json(
            {
              success: false,
              error: "Apenas administradores podem enviar mensagens neste grupo.",
              isAnnouncement: Boolean(chatRow.is_announcement),
              canSend: false,
            },
            403,
          );
        }

        const identityKind = (chatRow.identity_kind ||
          (isGroup ? "group" : isLidIdentifier(rawPhone) ? "lid" : "phone")) as
          "phone" | "lid" | "group" | "broadcast";
        const targetNumber = buildMessageDestination({
          remoteJid: chatRow.remote_jid || rawPhone,
          phoneE164: chatRow.phone_e164 || phone,
          identityKind,
        });

        const { data: existingOutbox } = await supabaseAdmin
          .from("outbound_messages")
          .select("id,status,external_id,attempts,chat_id,instance_id,remote_jid")
          .eq("workspace_id", auth.workspaceId)
          .eq("instance_id", chatRow.instance_id)
          .eq("client_message_id", clientMessageId)
          .maybeSingle();
        // A clientMessageId identifies exactly one outbound message to one chat.
        // Reusing it for a different destination is never a valid retry.
        if (
          existingOutbox &&
          (existingOutbox.chat_id !== chatRow.id ||
            existingOutbox.instance_id !== chatRow.instance_id ||
            existingOutbox.remote_jid !== targetNumber)
        ) {
          return json(
            {
              success: false,
              code: "IDEMPOTENCY_DESTINATION_MISMATCH",
              error: "Identificador reutilizado para outro destino",
            },
            409,
          );
        }
        const rawOutboundStatus = existingOutbox?.status;
        const normalizedOutboundStatus: OutboundStatus | null =
          rawOutboundStatus === "pending" ||
          rawOutboundStatus === "sending" ||
          rawOutboundStatus === "accepted" ||
          rawOutboundStatus === "confirmed" ||
          rawOutboundStatus === "unknown" ||
          rawOutboundStatus === "failed"
            ? rawOutboundStatus
            : rawOutboundStatus
              ? "unknown"
              : null;
        const outboundDecision = decideOutboundAttempt(normalizedOutboundStatus);
        if (outboundDecision === "duplicate") {
          const { data: existingMessage } = await supabaseAdmin
            .from("messages")
            .select("*")
            .eq("workspace_id", auth.workspaceId)
            .eq("instance_id", chatRow.instance_id)
            .eq("client_message_id", clientMessageId)
            .maybeSingle();
          return json({
            success: true,
            duplicated: true,
            message: existingMessage,
            messageId: existingMessage?.id ?? null,
            reconciliationPending: !existingMessage,
          });
        }
        if (outboundDecision === "ambiguous") {
          return json(
            {
              success: false,
              code: "DELIVERY_UNKNOWN",
              retryable: false,
              error:
                "O WhatsApp pode ter aceitado este envio. Aguarde a sincronização antes de tentar novamente.",
            },
            409,
          );
        }
        if (outboundDecision === "in-flight") {
          return json(
            {
              success: false,
              code: "SEND_IN_PROGRESS",
              retryable: false,
              error: "Este envio já está sendo processado. Aguarde a confirmação.",
            },
            409,
          );
        }

        const hasMedia = Boolean(payload.media || payload.mediaPath);
        const text = (payload.text ?? "").trim();
        if (!hasMedia && !text) return json({ success: false, error: "Mensagem vazia" }, 400);

        const mimetype = payload.mimetype ?? "application/octet-stream";
        const kind = hasMedia ? (payload.type ?? mediaTypeFromMime(mimetype)) : "text";
        const base64Only = payload.media?.includes(",")
          ? payload.media.slice(payload.media.indexOf(",") + 1)
          : payload.media;

        // Valida o arquivo antes de criar a outbox, para não deixar um envio
        // eternamente em `sending` por erro de contrato.
        if (payload.media) {
          const bytes = base64ToBytes(payload.media);
          if (bytes.length === 0) {
            return json({ success: false, error: "Arquivo inválido ou vazio" }, 400);
          }
          if (bytes.length > MAX_MEDIA_BYTES) {
            return json({ success: false, error: "Arquivo muito grande (máximo 45 MB)" }, 413);
          }
        }

        let uploadedMediaUrl: string | null = null;
        if (payload.mediaPath) {
          const expectedPrefix = `${auth.workspaceId}/outbound/${clientMessageId}/`;
          if (!payload.mediaPath.startsWith(expectedPrefix) || payload.mediaPath.includes("..")) {
            return json({ success: false, error: "Caminho de mídia inválido" }, 400);
          }
          const { data: signed, error: signedError } = await supabaseAdmin.storage
            .from("chat-media")
            .createSignedUrl(payload.mediaPath, 10 * 60);
          if (signedError || !signed?.signedUrl) {
            return json({ success: false, error: "Mídia enviada não foi encontrada" }, 400);
          }
          uploadedMediaUrl = signed.signedUrl;
        }

        const outboxPayload = {
          kind: hasMedia ? "media" : "text",
          mimetype: payload.mimetype ?? null,
          fileName: payload.fileName ?? null,
          hasQuote: Boolean(payload.quotedMessageId),
        };
        // Insert-first/compare-and-swap: two concurrent HTTP requests using the
        // same clientMessageId may NEVER both reach the Evolution send endpoint.
        const outboxInput = {
          workspace_id: auth.workspaceId,
          instance_id: chatRow.instance_id,
          chat_id: chatRow.id,
          client_message_id: clientMessageId,
          remote_jid: targetNumber,
          payload: outboxPayload,
          status: "sending" as const,
          attempts: (existingOutbox?.attempts ?? 0) + 1,
          last_error: null,
        };
        const reservation =
          outboundDecision === "claim-failed"
            ? await supabaseAdmin
                .from("outbound_messages")
                .update(outboxInput)
                .eq("workspace_id", auth.workspaceId)
                .eq("instance_id", chatRow.instance_id)
                .eq("client_message_id", clientMessageId)
                .eq("status", "failed")
                .eq("attempts", existingOutbox!.attempts)
                .select("id")
                .maybeSingle()
            : await supabaseAdmin
                .from("outbound_messages")
                .insert(outboxInput)
                .select("id")
                .maybeSingle();
        const { data: outbox, error: outboxError } = reservation;
        if (outboxError && outboxError.code !== "23505") {
          return json({ success: false, error: "Falha ao registrar envio" }, 500);
        }
        if (outboxError?.code === "23505" || !outbox) {
          return json(
            {
              success: false,
              code: "SEND_IN_PROGRESS",
              retryable: false,
              error: "Este envio já foi reservado por outra requisição. Aguarde a confirmação.",
            },
            409,
          );
        }

        const quotedSenderPhone =
          payload.quotedMessage && typeof payload.quotedMessage === "object"
            ? (payload.quotedMessage as { senderPhone?: unknown }).senderPhone
            : undefined;
        const quotedConfig = payload.quotedMessageId
          ? {
              quoted: {
                key: {
                  id: payload.quotedMessageId,
                  remoteJid: targetNumber,
                  ...(isGroup && typeof quotedSenderPhone === "string" && quotedSenderPhone
                    ? {
                        participant: `${cleanPhone(quotedSenderPhone)}@s.whatsapp.net`,
                      }
                    : {}),
                },
              },
            }
          : {};

        let evoResult;
        if (!hasMedia) {
          evoResult = await evolutionFetch<EvolutionSendResponse>(
            `/message/sendText/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              body: { number: targetNumber, text, ...quotedConfig },
            },
          );
        } else if (kind === "sticker") {
          evoResult = await evolutionFetch<EvolutionSendResponse>(
            `/message/sendSticker/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              body: {
                number: targetNumber,
                sticker: uploadedMediaUrl || base64Only,
                ...quotedConfig,
              },
            },
          );
        } else if (kind === "audio") {
          evoResult = await evolutionFetch<EvolutionSendResponse>(
            `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              body: {
                number: targetNumber,
                audio: uploadedMediaUrl || base64Only,
                encoding: Boolean(base64Only),
                delay: 0,
                ...quotedConfig,
              },
            },
          );
        } else {
          evoResult = await evolutionFetch<EvolutionSendResponse>(
            `/message/sendMedia/${encodeURIComponent(instanceName)}`,
            {
              method: "POST",
              body: {
                number: targetNumber,
                mediatype: kind,
                mimetype,
                media: uploadedMediaUrl || base64Only,
                fileName:
                  payload.fileName ?? `arquivo.${(mimetype.split("/")[1] ?? "bin").split(";")[0]}`,
                caption: payload.text ?? "",
                ...quotedConfig,
              },
            },
          );
        }

        // Se a Evolution recusou o envio, não gravamos mensagem fantasma no histórico
        if (!evoResult.ok) {
          const deliveryUnknown = isAmbiguousEvolutionSendFailure(evoResult.status);
          await supabaseAdmin
            .from("outbound_messages")
            .update({
              status: deliveryUnknown ? "unknown" : "failed",
              last_error: errorMessage(evoResult.error, "Falha na Evolution"),
            })
            .eq("id", outbox.id);
          const errStr = String(evoResult.error ?? "").toLowerCase();
          const isAdminBlocked =
            errStr.includes("admin") ||
            errStr.includes("not allowed") ||
            errStr.includes("restricted") ||
            errStr.includes("forbidden") ||
            errStr.includes("403");

          if (isGroup && isAdminBlocked) {
            recordGroupMetadata(auth.workspaceId, instanceName, phone, {
              announce: true,
              canSend: false,
            });
            return json(
              {
                success: false,
                error: "Apenas administradores podem enviar mensagens neste grupo.",
                isAnnouncement: true,
                canSend: false,
              },
              403,
            );
          }

          return json(
            {
              success: false,
              error: deliveryUnknown
                ? "A confirmação da Evolution expirou; o envio pode ter sido aceito e não será repetido automaticamente."
                : errorMessage(evoResult.error, "Falha ao enviar pelo WhatsApp"),
              code: deliveryUnknown ? "DELIVERY_UNKNOWN" : "EVOLUTION_REJECTED",
              retryable: !deliveryUnknown,
            },
            502,
          );
        }

        // Evolution already accepted this message. Mark durable outbox accepted
        // BEFORE optional storage/persistence can fail: never re-send after 2xx.
        const evolutionMessageId = evoResult.data?.key?.id ?? null;
        const { error: acceptedError } = await supabaseAdmin
          .from("outbound_messages")
          .update({
            status: "accepted",
            external_id: evolutionMessageId,
            accepted_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", outbox.id);
        if (acceptedError) {
          logServerError(
            "[evolution-send] upstream accepted but outbox update failed",
            acceptedError,
          );
          return json(
            {
              success: true,
              accepted: true,
              reconciliationPending: true,
              code: "OUTBOX_RECONCILIATION_REQUIRED",
              clientMessageId,
              error:
                "Evolution aceitou a mensagem, mas o painel ainda não confirmou o registro. Não reenviar.",
            },
            202,
          );
        }

        // Optional local media storage and UI history are downstream operations.
        // Never mistake their failures for a WhatsApp send failure.
        let mediaUrl: string | null = null;
        let mediaWarning: string | null = null;
        let saved: Awaited<ReturnType<typeof persistMessage>>;
        try {
          if (payload.mediaPath) {
            mediaUrl = `/api/media/${payload.mediaPath}`;
          } else if (hasMedia && payload.media) {
            const stored = await storeBase64Media(
              payload.media,
              mimetype,
              payload.fileName,
              auth.workspaceId,
            );
            mediaUrl = stored.url;
            mediaWarning = stored.error ?? null;
          }
          saved = await persistMessage({
            workspaceId: auth.workspaceId,
            clientMessageId,
            instanceName,
            phone,
            isGroup,
            sender: "agent",
            type: kind,
            text: payload.text ?? null,
            mediaUrl,
            mediaMimetype: hasMedia ? mimetype : null,
            mediaFilename: payload.fileName ?? null,
            mediaDuration: payload.duration ?? null,
            externalId: evolutionMessageId,
            quotedMessage: payload.quotedMessage ?? null,
            remoteJid: targetNumber,
            identityKind,
          });
        } catch (error) {
          logServerError(
            "[evolution-send] local persistence failed after upstream accepted",
            error,
          );
          return json(
            {
              success: true,
              accepted: true,
              reconciliationPending: true,
              code: "MESSAGE_RECONCILIATION_REQUIRED",
              clientMessageId,
              error:
                "Mensagem aceita no WhatsApp; o histórico local precisa ser reconciliado. Não reenviar.",
            },
            202,
          );
        }
        if (saved && "error" in saved && saved.error) {
          logServerError("[evolution-send] local persistence returned an error", saved.error);
          return json(
            {
              success: true,
              accepted: true,
              reconciliationPending: true,
              code: "MESSAGE_RECONCILIATION_REQUIRED",
              clientMessageId,
              error:
                "Mensagem aceita no WhatsApp; o histórico local precisa ser reconciliado. Não reenviar.",
            },
            202,
          );
        }

        // P1-03: Takeover humano atômico - quando o humano envia mensagem, pausa a IA no chat
        if (saved && "chatId" in saved && saved.chatId) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("chats")
            .update({ ai_paused: true })
            .eq("id", saved.chatId)
            .eq("workspace_id", auth.workspaceId);

          // A real operator message claims a queued handoff.  This keeps the
          // SLA badge in sync even when the operator answers directly instead
          // of clicking "Assumir atendimento" first.
          const { error: handoverClaimError } = await supabaseAdmin
            .from("handover_requests")
            .update({
              status: "in_progress",
              assigned_to: auth.id,
              accepted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("workspace_id", auth.workspaceId)
            .eq("chat_id", saved.chatId)
            .in("status", ["queued", "assigned"]);
          if (handoverClaimError)
            logServerError(
              "[handover] failed to claim request after human message",
              handoverClaimError,
            );
        }

        const savedMessage =
          saved && "message" in saved && saved.message && typeof saved.message === "object"
            ? (saved.message as { id?: string })
            : null;
        return json({
          success: true,
          mediaUrl,
          ...(mediaWarning ? { warning: mediaWarning } : {}),
          messageId: savedMessage?.id ?? null,
          message: saved && "message" in saved ? saved.message : null,
        });
      },
    },
  },
});
