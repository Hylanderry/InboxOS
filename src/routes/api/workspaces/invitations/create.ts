import { createFileRoute } from "@tanstack/react-router";
import { inviteMember } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/invitations/create")({
  server: {
    handlers: {
      POST: async ({ request }) => inviteMember(request, await request.json().catch(() => null)),
    },
  },
});
