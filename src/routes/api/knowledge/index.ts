import { createFileRoute } from "@tanstack/react-router";
import {
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  updateKnowledgeDocument,
} from "@/server/product/knowledge-base.server";

export const Route = createFileRoute("/api/knowledge/")({
  server: {
    handlers: {
      GET: ({ request }) => listKnowledgeDocuments(request),
      POST: async ({ request }) =>
        createKnowledgeDocument(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) =>
        updateKnowledgeDocument(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteKnowledgeDocument(request),
    },
  },
});
