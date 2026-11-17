import { createFileRoute } from "@tanstack/react-router";
import { getWorkspaceLegalDocuments } from "@/server/auth/legal-status.server";

export const Route = createFileRoute("/api/legal/documents")({
  server: { handlers: { GET: ({ request }) => getWorkspaceLegalDocuments(request) } },
});
