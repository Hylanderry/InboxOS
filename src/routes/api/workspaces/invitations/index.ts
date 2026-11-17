import { createFileRoute } from "@tanstack/react-router";
import { listInvitations } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/invitations/")({
  server: { handlers: { GET: ({ request }) => listInvitations(request) } },
});
