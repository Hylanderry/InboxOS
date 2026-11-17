/** Short-lived in-process metadata for a *specific* workspace AND WhatsApp instance.
 * Never key by group JID alone: the same group may be connected by customers
 * in different workspaces, with different account permissions.
 */
import { scopedIdentityKey } from "./contact-identity.ts";

export interface GroupMetadataState {
  id: string;
  announce: boolean;
  restrict?: boolean;
  isAdmin?: boolean;
  canSend: boolean;
  subject?: string | null;
  desc?: string | null;
  updatedAt: number;
}

const groupMetadataCache = new Map<string, GroupMetadataState>();

function cleanGroupId(groupId: string): string {
  return String(groupId).split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
}

function groupKey(workspaceId: string, instanceName: string, groupId: string): string | null {
  if (!workspaceId.trim() || !instanceName.trim()) return null;
  const id = cleanGroupId(groupId);
  return id ? scopedIdentityKey(workspaceId, instanceName, id) : null;
}

export function recordGroupMetadata(
  workspaceId: string,
  instanceName: string,
  groupId: string,
  metadata: Partial<GroupMetadataState>,
): GroupMetadataState | null {
  const key = groupKey(workspaceId, instanceName, groupId);
  if (!key) return null;
  const id = cleanGroupId(groupId);
  const existing = groupMetadataCache.get(key);
  const announce =
    metadata.announce !== undefined ? metadata.announce : (existing?.announce ?? false);
  const isAdmin = metadata.isAdmin !== undefined ? metadata.isAdmin : (existing?.isAdmin ?? false);
  // A change to announce/admin invalidates cached send privileges even if
  // the webhook omits canSend; preserving the old value grants stale access.
  const permissionChanged = metadata.announce !== undefined || metadata.isAdmin !== undefined;
  const canSend =
    metadata.canSend !== undefined
      ? metadata.canSend
      : permissionChanged
        ? !announce || isAdmin
        : (existing?.canSend ?? (!announce || isAdmin));
  const updated: GroupMetadataState = {
    id,
    announce,
    restrict: metadata.restrict !== undefined ? metadata.restrict : (existing?.restrict ?? false),
    isAdmin,
    canSend,
    subject: metadata.subject !== undefined ? metadata.subject : (existing?.subject ?? null),
    desc: metadata.desc !== undefined ? metadata.desc : (existing?.desc ?? null),
    updatedAt: Date.now(),
  };
  groupMetadataCache.set(key, updated);
  return updated;
}

export function getGroupMetadata(
  workspaceId: string,
  instanceName: string,
  groupId: string,
): GroupMetadataState | null {
  const key = groupKey(workspaceId, instanceName, groupId);
  return key ? (groupMetadataCache.get(key) ?? null) : null;
}

export function getAllGroupMetadata(
  workspaceId: string,
  instanceName: string,
): Record<string, GroupMetadataState> {
  const prefix = scopedIdentityKey(workspaceId, instanceName, "");
  const result: Record<string, GroupMetadataState> = {};
  if (!workspaceId.trim() || !instanceName.trim()) return result;
  for (const [key, state] of groupMetadataCache) {
    if (key.startsWith(prefix)) result[state.id] = state;
  }
  return result;
}
