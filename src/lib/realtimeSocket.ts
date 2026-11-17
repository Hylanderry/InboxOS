import { apiFetch } from "./api-fetch";

export interface RealtimePayload {
  event_type?: string;
  payload?: {
    chat_id?: string | null;
    id?: string | null;
    [key: string]: unknown;
  };
  phone?: string | null;
  state?: string | null;
  updated_at?: string | null;
  instance_id?: string | null;
  instance_name?: string | null;
  [key: string]: unknown;
}

type Handler = (payload: RealtimePayload) => void;

export interface RealtimeSocket {
  on: (event: string, handler: Handler) => () => void;
  disconnect: () => void;
}

const NORMAL_INTERVAL_MS = 1_500;
const MAX_BACKOFF_MS = 30_000;

export function createRealtimeSocket(): RealtimeSocket {
  const handlers = new Map<string, Set<Handler>>();
  let stopped = false;
  let connected = false;
  let cursor = "";
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let workspaceEpoch = 0;

  const emit = (event: string, payload: RealtimePayload) => {
    for (const handler of handlers.get(event) ?? []) {
      try {
        handler(payload);
      } catch (error) {
        console.warn("[events] handler failed", error);
      }
    }
  };

  const handleWorkspaceChange = () => {
    workspaceEpoch += 1;
    cursor = "";
    failures = 0;
    connected = false;
    if (!inFlight) void tick();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("inboxos:workspace-change", handleWorkspaceChange);
  }

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(() => void tick(), delay);
  };

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const requestEpoch = workspaceEpoch;
    let hasMore = false;
    try {
      const response = await apiFetch(
        `/api/events/?cursor=${encodeURIComponent(cursor)}&limit=200`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        cursor?: unknown;
        hasMore?: unknown;
        snapshot?: { presences?: RealtimePayload[] };
        events?: RealtimePayload[];
      };
      // A workspace switch can race an in-flight request. Discard the old
      // response so events/cursors never cross tenant boundaries.
      if (requestEpoch !== workspaceEpoch) return;
      cursor = typeof data.cursor === "string" ? data.cursor : cursor;
      hasMore = Boolean(data.hasMore);
      failures = 0;
      if (!connected) {
        connected = true;
        emit("connect", {});
      }

      for (const presence of data.snapshot?.presences ?? []) emit("presence:change", presence);
      for (const event of data.events ?? []) {
        emit("event", event);
        const [entity] = String(event.event_type || "").split(".");
        if (entity) emit(`${entity}:change`, event);
      }
    } catch (error) {
      failures += 1;
      if (connected) {
        connected = false;
        emit("disconnect", { error });
      }
    } finally {
      inFlight = false;
      schedule(hasMore ? 0 : Math.min(MAX_BACKOFF_MS, NORMAL_INTERVAL_MS * 2 ** failures));
    }
  };

  void tick();
  return {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(event, set);
      return () => {
        set.delete(handler);
      };
    },
    disconnect() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("inboxos:workspace-change", handleWorkspaceChange);
      }
      handlers.clear();
    },
  };
}

let sharedSocket: RealtimeSocket | null = null;
export function subscribeInboxEvent(event: string, handler: Handler): () => void {
  sharedSocket ??= createRealtimeSocket();
  return sharedSocket.on(event, handler);
}
