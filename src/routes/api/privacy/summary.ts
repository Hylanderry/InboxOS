import { createFileRoute } from "@tanstack/react-router";
import { getPrivacySummary } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/privacy/summary")({
  server: { handlers: { GET: ({ request }) => getPrivacySummary(request) } },
});
