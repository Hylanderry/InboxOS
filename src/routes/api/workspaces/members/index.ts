import { createFileRoute } from "@tanstack/react-router";
import { listMembers, mutateMember } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/members/")({
  server: {
    handlers: {
      GET: ({ request }) => listMembers(request),
      POST: async ({ request }) => mutateMember(request, await request.json().catch(() => null)),
    },
  },
});
