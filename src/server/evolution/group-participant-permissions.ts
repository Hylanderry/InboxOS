/** A participant event must not turn an ordinary group member into a
 * read-only account. Unknown actions must not mutate cached permissions.
 */
export function permissionsAfterOwnGroupParticipantUpdate(
  action: string,
  isAnnouncement: boolean,
): { isAdmin: boolean; canSend: boolean } | null {
  switch (action.toLowerCase()) {
    case "promote":
      return { isAdmin: true, canSend: true };
    case "demote":
    case "add":
      return { isAdmin: false, canSend: !isAnnouncement };
    case "remove":
      return { isAdmin: false, canSend: false };
    default:
      return null;
  }
}
