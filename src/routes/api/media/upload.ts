import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiPermission } from "@/server/middleware/auth";
import { MAX_MEDIA_BYTES } from "@/lib/evolution.server";

const uploadSchema = z.object({
  clientMessageId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(240),
  mimetype: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_MEDIA_BYTES),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeFileName(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || "arquivo.bin";
}

export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiPermission(request, "messages.send");
        if (auth instanceof Response) return auth;

        const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ success: false, error: "Arquivo inválido" }, 400);

        const path = `${auth.workspaceId}/outbound/${parsed.data.clientMessageId}/${safeFileName(parsed.data.fileName)}`;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("chat-media")
          .createSignedUploadUrl(path, { upsert: true });
        if (error || !data?.token) {
          return json({ success: false, error: "Falha ao preparar upload privado" }, 502);
        }

        return json({ success: true, path, token: data.token });
      },
    },
  },
});
