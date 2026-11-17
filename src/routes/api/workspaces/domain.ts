import { createFileRoute } from "@tanstack/react-router";
import { getWorkspaceDomain, updateCompanyProfile } from "@/server/auth/profile.server";

export const Route = createFileRoute("/api/workspaces/domain")({
  server: {
    handlers: {
      GET: ({ request }) => getWorkspaceDomain(request),
      PATCH: async ({ request }) =>
        updateCompanyProfile(request, await request.json().catch(() => null)),
    },
  },
});
