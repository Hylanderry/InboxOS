import { createFileRoute } from "@tanstack/react-router";
import { revokeInvitation } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/invitations/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        revokeInvitation(request, await request.json().catch(() => null)),
    },
  },
});
