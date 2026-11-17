import { createFileRoute } from "@tanstack/react-router";
import { getProfile, updateProfile } from "@/server/auth/profile.server";
export const Route = createFileRoute("/api/profile/")({
  server: {
    handlers: {
      GET: ({ request }) => getProfile(request),
      PATCH: async ({ request }) => updateProfile(request, await request.json().catch(() => null)),
    },
  },
});
