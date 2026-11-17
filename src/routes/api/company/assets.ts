import { createFileRoute } from "@tanstack/react-router";
import { requireApiPermission } from "@/server/middleware/auth";

function allowedPath(value: string, workspaceId: string) {
  const path = value.trim();
  if (
    !path.startsWith(`workspaces/${workspaceId}/`) ||
    path.includes("..") ||
    path.includes("\\") ||
    path.length > 300
  ) {
    return null;
  }
  const filename = path.slice(`workspaces/${workspaceId}/`.length);
  if (
    !/^(?:logo-(?:light|dark|default)-|favicon-)[a-f0-9-]+\.(?:jpg|jpeg|png|webp)$/i.test(filename)
  ) {
    return null;
  }
  return path;
}

export const Route = createFileRoute("/api/company/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const context = await requireApiPermission(request, "workspace.read");
        if (context instanceof Response) return context;
        const rawPath = new URL(request.url).searchParams.get("path");
        const path = rawPath ? allowedPath(rawPath, context.workspaceId) : null;
        if (!path) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("profile-media")
          .createSignedUrl(path, 300);
        if (error || !data?.signedUrl) return new Response("Not found", { status: 404 });
        return Response.redirect(data.signedUrl, 302);
      },
    },
  },
});
