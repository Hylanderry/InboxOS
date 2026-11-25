export type ActivePresence = "composing" | "recording";
export type PresenceMap = Record<string, ActivePresence>;

const PRESENCE_TTL_MS = 15_000;

export function presenceKey(
  phone: string,
  instanceName?: string | null,
  instanceId?: string | null,
) {
  const normalizedPhone = phone.replace(/\D/g, "");
  const normalizedInstance = instanceId?.trim() || instanceName?.trim() || "";
  return normalizedInstance ? `${normalizedInstance}:${normalizedPhone}` : normalizedPhone;
}

/**
 * Store externo de presença (digitando/gravando) compatível com useSyncExternalStore.
 * - O snapshot por chave é uma string estável: a row só re-renderiza quando o estado
 *   do SEU contato muda.
 * - Eventos repetidos com o mesmo estado só renovam o TTL, sem notificar ninguém.
 */
export function createPresenceStore() {
  let presences: PresenceMap = {};
  const listeners = new Set<() => void>();
  const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const remove = (key: string) => {
    expiryTimers.delete(key);
    if (!(key in presences)) return;
    const { [key]: _removed, ...next } = presences;
    presences = next;
    emit();
  };

  return {
    getSnapshot: () => presences,
    getState: (key: string): ActivePresence | undefined => presences[key],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
    update(
      phone: string,
      state: string,
      updatedAt?: string,
      instanceName?: string | null,
      instanceId?: string | null,
    ) {
      const normalizedPhone = phone.replace(/\D/g, "");
      const normalizedInstance = instanceName?.trim() || instanceId?.trim() || "";
      // Evento sem instância não pode ser atribuído com segurança: ignorar.
      if (!normalizedPhone || !normalizedInstance) return;
      const key = presenceKey(normalizedPhone, normalizedInstance, instanceId);

      const previousTimer = expiryTimers.get(key);
      if (previousTimer) clearTimeout(previousTimer);

      const eventAge = updatedAt ? Date.now() - new Date(updatedAt).getTime() : 0;
      if ((state !== "composing" && state !== "recording") || eventAge > PRESENCE_TTL_MS) {
        remove(key);
        return;
      }

      if (presences[key] !== state) {
        presences = { ...presences, [key]: state };
        emit();
      }
      const remaining = Math.max(250, PRESENCE_TTL_MS - Math.max(0, eventAge));
      expiryTimers.set(
        key,
        setTimeout(() => remove(key), remaining),
      );
    },
    clear() {
      for (const timer of expiryTimers.values()) clearTimeout(timer);
      expiryTimers.clear();
      presences = {};
      emit();
    },
  };
}
