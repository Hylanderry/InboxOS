/** Billing is an independent fork and is disabled in the main InboxOS product. */
export function billingServerEnabled(): boolean {
  return process.env["ENABLE_BILLING"] === "true";
}
