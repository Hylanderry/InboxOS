import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/components/LegalDocumentPage";
import { getLegalDocument } from "@/features/legal/legal-documents";
export const Route = createFileRoute("/legal/acceptable-use")({ component: AcceptableUsePage });
function AcceptableUsePage() {
  return <LegalDocumentPage document={getLegalDocument("acceptable-use")!} />;
}
