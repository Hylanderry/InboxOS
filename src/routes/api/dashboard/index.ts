import { createFileRoute } from "@tanstack/react-router";
import { getDashboard } from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/dashboard/")({
  server: { handlers: { GET: ({ request }) => getDashboard(request) } },
});
