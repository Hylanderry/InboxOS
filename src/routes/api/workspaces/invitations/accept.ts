import { createFileRoute } from "@tanstack/react-router";
import { acceptInvitation } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/invitations/accept")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        acceptInvitation(request, await request.json().catch(() => null)),
    },
  },
});
