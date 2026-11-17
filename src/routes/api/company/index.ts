import { createFileRoute } from "@tanstack/react-router";
import { getCompanyProfile, updateCompanyProfile } from "@/server/auth/profile.server";
export const Route = createFileRoute("/api/company/")({
  server: {
    handlers: {
      GET: ({ request }) => getCompanyProfile(request),
      PATCH: async ({ request }) =>
        updateCompanyProfile(request, await request.json().catch(() => null)),
    },
  },
});
