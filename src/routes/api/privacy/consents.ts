import { createFileRoute } from "@tanstack/react-router";
import { listConsentHistory } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/consents")({
  server: { handlers: { GET: ({ request }) => listConsentHistory(request) } },
});
