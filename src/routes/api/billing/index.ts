import { createFileRoute } from "@tanstack/react-router";
import { billingServerEnabled } from "@/server/product/billing-flag";
import { getBilling } from "@/server/product/workspace-product.server";
export const Route = createFileRoute("/api/billing/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        billingServerEnabled()
          ? getBilling(request)
          : new Response(JSON.stringify({ error: "Not Found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            }),
    },
  },
});
