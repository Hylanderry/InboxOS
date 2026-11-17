import { createFileRoute } from "@tanstack/react-router";
import { updatePrivacySettings } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/settings")({
  server: {
    handlers: {
      PATCH: async ({ request }) =>
        updatePrivacySettings(request, await request.json().catch(() => null)),
    },
  },
});
