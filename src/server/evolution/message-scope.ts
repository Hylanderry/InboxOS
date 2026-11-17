/** Guard against accidental workspace-wide Evolution message mutations.
 * A workspace can own multiple WhatsApp instances with the same external message ID.
 */
export function requireMessageInstanceScope(instanceId: string): string {
  if (
    typeof instanceId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId)
  ) {
    throw new Error("Evolution message mutation requires a valid instance_id");
  }
  return instanceId;
}
