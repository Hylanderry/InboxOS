import { createFileRoute } from "@tanstack/react-router";
import { adminWorkspaces, adminMutateWorkspace } from "@/server/admin/admin-operations.server";
export const Route = createFileRoute("/api/admin/workspaces/")({
  server: {
    handlers: {
      GET: ({ request }) => adminWorkspaces(request),
      PATCH: async ({ request }) =>
        adminMutateWorkspace(request, await request.json().catch(() => null)),
    },
  },
});
