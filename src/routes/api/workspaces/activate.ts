import { createFileRoute } from "@tanstack/react-router";
import { activateWorkspace } from "@/server/workspace/workspaces.server";
export const Route = createFileRoute("/api/workspaces/activate")({
  server: { handlers: { POST: ({ request }) => activateWorkspace(request) } },
});
