import { useState, useEffect, useCallback, useRef } from "react";
import type { WhatsAppInstance } from "@/features/inbox/types";
import { apiFetch } from "@/lib/api-fetch";
import { subscribeInboxEvent } from "@/lib/realtimeSocket";

function mapInstance(input: unknown): WhatsAppInstance {
  const inst = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const value = (...keys: string[]) => keys.map((key) => inst[key]).find((item) => item != null);
  const rawState = value("state", "status") ?? "disconnected";
  const state: WhatsAppInstance["state"] =
    rawState === "open" ? "open" : rawState === "connecting" ? "connecting" : "disconnected";
  return {
    id: String(value("instanceName", "instance_name", "id", "name") ?? ""),
    instanceName: String(value("instanceName", "instance_name", "name") ?? ""),
    alias: String(
      value("alias", "display_name", "displayName", "instanceName", "instance_name") ?? "",
    ),
    state,
    phone: value("phone") ? `+${String(value("phone")).replace(/^\+/, "")}` : null,
    profilePicUrl: value("profilePicUrl", "profile_pic_url")
      ? String(value("profilePicUrl", "profile_pic_url"))
      : null,
  };
}

export function useInstances() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Incrementa a cada troca de workspace: respostas de requests anteriores são descartadas
  // para nunca mostrar instâncias do workspace anterior.
  const epochRef = useRef(0);

  const fetchInstances = useCallback(async (silent = false) => {
    const epoch = epochRef.current;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/instances/", {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (epoch !== epochRef.current) return;
      if (Array.isArray(data)) {
        // A disconnected Evolution session is removed server-side. Filter a
        // stale response too, so it never flashes back into the UI between
        // the provider event and the next reconciliation request.
        setInstances(data.map(mapInstance).filter((instance) => instance.state !== "disconnected"));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar instâncias");
    } finally {
      if (!silent && epoch === epochRef.current) setIsLoading(false);
    }
  }, []);

  const deleteInstance = useCallback(async (instanceName: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/instances/${encodeURIComponent(instanceName)}/`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInstances((prev) => prev.filter((i) => i.instanceName !== instanceName));
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao excluir instância");
      return false;
    }
  }, []);

  useEffect(() => {
    const handleWorkspaceChange = () => {
      epochRef.current += 1;
      setInstances([]);
      setError(null);
      void fetchInstances();
    };
    window.addEventListener("inboxos:workspace-change", handleWorkspaceChange);
    void fetchInstances();
    const unsubscribe = subscribeInboxEvent("whatsapp_instances:change", () => {
      void fetchInstances(true);
    });

    const handleFocus = () => {
      if (document.visibilityState === "visible") void fetchInstances(true);
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleFocus);
    const interval = setInterval(handleFocus, 30_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleFocus);
      window.removeEventListener("inboxos:workspace-change", handleWorkspaceChange);
    };
  }, [fetchInstances]);

  return {
    instances,
    isLoading,
    error,
    refetch: () => fetchInstances(false),
    deleteInstance,
  };
}
