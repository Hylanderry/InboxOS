import { createFileRoute } from "@tanstack/react-router";
import { listWorkspaceAudit } from "@/server/privacy/privacy.server";

export const Route = createFileRoute("/api/workspaces/audit")({
  server: { handlers: { GET: ({ request }) => listWorkspaceAudit(request) } },
});
