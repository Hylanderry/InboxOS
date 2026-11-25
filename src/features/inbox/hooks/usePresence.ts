import { useCallback, useSyncExternalStore } from "react";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";
import { createPresenceStore, presenceKey, type PresenceMap } from "./presence-store";

const store = createPresenceStore();

type PresenceRow = {
  phone?: string;
  state?: string;
  updated_at?: string | null;
  instance_id?: string | null;
  instance_name?: string | null;
};

// Uma única ligação com o realtime para toda a lista, ativa enquanto houver
// pelo menos um componente observando (antes: 3 assinaturas por ConversationRow).
let bridgeCleanup: (() => void) | null = null;

function startBridge() {
  const onWorkspaceChange = () => store.clear();
  window.addEventListener("inboxos:workspace-change", onWorkspaceChange);
  const unsubscribeChange = subscribeInboxEvent("whatsapp_presence:change", (event) => {
    const row = event?.payload as PresenceRow | undefined;
    if (!row) return;
    const isDelete = String(event.event_type || "").endsWith(".delete");
    store.update(
      String(row.phone ?? ""),
      isDelete ? "unavailable" : String(row.state ?? ""),
      row.updated_at ?? undefined,
      row.instance_name ?? undefined,
      row.instance_id ?? undefined,
    );
  });
  const unsubscribeSnapshot = subscribeInboxEvent("presence:change", (row) => {
    store.update(
      String(row?.phone ?? ""),
      String(row?.state ?? ""),
      row?.updated_at ?? undefined,
      row?.instance_name ?? undefined,
      row?.instance_id ?? undefined,
    );
  });
  return () => {
    window.removeEventListener("inboxos:workspace-change", onWorkspaceChange);
    unsubscribeChange();
    unsubscribeSnapshot();
  };
}

function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener);
  if (!bridgeCleanup) bridgeCleanup = startBridge();
  return () => {
    unsubscribe();
    if (store.listenerCount() === 0 && bridgeCleanup) {
      bridgeCleanup();
      bridgeCleanup = null;
    }
  };
}

/** Estado de presença de UM contato. Só re-renderiza quando esse estado muda. */
export function usePresenceState(
  phone?: string | null,
  instanceName?: string | null,
  instanceId?: string | null,
) {
  const key =
    phone && (instanceName?.trim() || instanceId?.trim())
      ? presenceKey(phone, instanceName, instanceId)
      : "";
  return useSyncExternalStore(
    subscribe,
    () => (key ? store.getState(key) : undefined),
    () => undefined,
  );
}

/** Mapa completo — usar só em componentes únicos (header/timeline), nunca por row. */
export function usePresence() {
  const presences = useSyncExternalStore(
    subscribe,
    store.getSnapshot,
    () => ({}) as PresenceMap,
  );

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
