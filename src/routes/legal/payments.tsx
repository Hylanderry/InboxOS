import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/components/LegalDocumentPage";
import { getLegalDocument } from "@/features/legal/legal-documents";
export const Route = createFileRoute("/legal/payments")({ component: PaymentsPage });
function PaymentsPage() {
  return <LegalDocumentPage document={getLegalDocument("payments-cancellation")!} />;
}
