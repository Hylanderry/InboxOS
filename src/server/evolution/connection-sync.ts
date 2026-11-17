// Connection bootstrap intentionally imports metadata only. Message history is
// never part of normal connection sync: live messages arrive via MESSAGES_UPSERT.
export const CONNECTION_SYNC_PHASES = ["contacts", "groups"] as const;

export type ConnectionSyncPhase = (typeof CONNECTION_SYNC_PHASES)[number];

export function connectionSyncPhases(state: unknown): ConnectionSyncPhase[] {
  return String(state ?? "").toLowerCase() === "open" ? [...CONNECTION_SYNC_PHASES] : [];
}

export function connectionSyncPayload(instanceName: string, phase: ConnectionSyncPhase) {
  return {
    event: `sync.${phase}`,
    instance: instanceName,
    data: { phase },
  };
}

export function groupParticipantSyncPayload(instanceName: string, groupJid: string) {
  return {
    event: "sync.group-participants",
    instance: instanceName,
    data: { groupJid },
  };
}
