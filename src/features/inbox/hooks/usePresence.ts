import { useCallback, useEffect, useState } from "react";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";

type ActivePresence = "composing" | "recording";
type PresenceMap = Record<string, ActivePresence>;

let globalPresences: PresenceMap = {};
const listeners = new Set<(presences: PresenceMap) => void>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function publish(next: PresenceMap) {
  globalPresences = next;
  for (const listener of listeners) listener(next);
}

function presenceKey(phone: string, instanceName?: string | null, instanceId?: string | null) {
  const normalizedPhone = phone.replace(/\D/g, "");
  const normalizedInstance = instanceId?.trim() || instanceName?.trim() || "";
  return normalizedInstance ? `${normalizedInstance}:${normalizedPhone}` : normalizedPhone;
}

function updatePresence(
  phone: string,
  state: string,
  updatedAt?: string,
  instanceName?: string | null,
  instanceId?: string | null,
) {
  const normalizedPhone = phone.replace(/\D/g, "");
  const normalizedInstance = instanceName?.trim() || instanceId?.trim() || "";
  // An unscoped presence event cannot be safely attributed to the active
  // WhatsApp connection. Ignore it instead of putting a phone-only key in the
  // shared client map where it could leak across instances/workspaces.
  if (!normalizedPhone || !normalizedInstance) return;
  const key = presenceKey(normalizedPhone, normalizedInstance, instanceId);

  const previousTimer = expiryTimers.get(key);
  if (previousTimer) clearTimeout(previousTimer);

  const eventAge = updatedAt ? Date.now() - new Date(updatedAt).getTime() : 0;
  if ((state !== "composing" && state !== "recording") || eventAge > 15_000) {
    const { [key]: _removed, ...next } = globalPresences;
    publish(next);
    expiryTimers.delete(key);
    return;
  }

  publish({ ...globalPresences, [key]: state });
  const remaining = Math.max(250, 15_000 - Math.max(0, eventAge));
  expiryTimers.set(
    key,
    setTimeout(() => {
      const { [key]: _removed, ...next } = globalPresences;
      publish(next);
      expiryTimers.delete(key);
    }, remaining),
  );
}

export function usePresence() {
  const [presences, setPresences] = useState<PresenceMap>(globalPresences);

  useEffect(() => {
    listeners.add(setPresences);
    const clearWorkspacePresence = () => {
      globalPresences = {};
      for (const timer of expiryTimers.values()) clearTimeout(timer);
      expiryTimers.clear();
      publish({});
    };
    window.addEventListener("inboxos:workspace-change", clearWorkspacePresence);
    const unsubscribe = subscribeInboxEvent("whatsapp_presence:change", (event) => {
      const row = event?.payload as
        | {
            phone?: string;
            state?: string;
            updated_at?: string;
            instance_id?: string;
            instance_name?: string;
          }
        | undefined;
      if (!row) return;
      const isDelete = String(event.event_type || "").endsWith(".delete");
      updatePresence(
        String(row.phone ?? ""),
        isDelete ? "unavailable" : String(row.state ?? ""),
        row.updated_at,
        row.instance_name ?? undefined,
        row.instance_id ?? undefined,
      );
    });
    const unsubscribeSnapshot = subscribeInboxEvent("presence:change", (row) => {
      updatePresence(
        String(row?.phone ?? ""),
        String(row?.state ?? ""),
        row?.updated_at ?? undefined,
        row?.instance_name ?? undefined,
        row?.instance_id ?? undefined,
      );
    });

    return () => {
      listeners.delete(setPresences);
      window.removeEventListener("inboxos:workspace-change", clearWorkspacePresence);
      unsubscribe();
      unsubscribeSnapshot();
    };
  }, []);

  const isTyping = useCallback(
    (phone?: string | null, instanceName?: string | null, instanceId?: string | null) =>
      Boolean(
        phone &&
        (instanceName?.trim() || instanceId?.trim()) &&
        presences[presenceKey(phone, instanceName, instanceId)] === "composing",
      ),
    [presences],
  );

  const isRecording = useCallback(
    (phone?: string | null, instanceName?: string | null, instanceId?: string | null) =>
      Boolean(
        phone &&
        (instanceName?.trim() || instanceId?.trim()) &&
        presences[presenceKey(phone, instanceName, instanceId)] === "recording",
      ),
    [presences],
  );

  return { presences, isTyping, isRecording };
}
