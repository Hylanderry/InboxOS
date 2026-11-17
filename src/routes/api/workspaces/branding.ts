import { createFileRoute } from "@tanstack/react-router";
import { getWorkspaceBranding, updateCompanyProfile } from "@/server/auth/profile.server";

export const Route = createFileRoute("/api/workspaces/branding")({
  server: {
    handlers: {
      GET: ({ request }) => getWorkspaceBranding(request),
      PATCH: async ({ request }) =>
        updateCompanyProfile(request, await request.json().catch(() => null)),
    },
  },
});
