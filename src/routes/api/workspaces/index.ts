import { createFileRoute } from "@tanstack/react-router";
import { createWorkspace, listWorkspaces } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/")({
  server: {
    handlers: {
      GET: ({ request }) => listWorkspaces(request),
      POST: async ({ request }) => createWorkspace(request, await request.json().catch(() => null)),
    },
  },
});
