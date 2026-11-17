import { createFileRoute } from "@tanstack/react-router";
import { getLegalStatus } from "@/server/auth/legal-status.server";
export const Route = createFileRoute("/api/legal/status")({
  server: { handlers: { GET: ({ request }) => getLegalStatus(request) } },
});
