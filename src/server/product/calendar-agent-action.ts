const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CalendarAgentDirective =
  | {
      action: "reschedule";
      appointmentId: string;
      startsAt: string;
      endsAt: string;
    }
  | {
      action: "create";
      calendarId?: string;
      title: string;
      startsAt: string;
      endsAt: string;
    }
  | { action: "cancel"; appointmentId: string };

export function extractCalendarDirective(text: string): {
  directive: CalendarAgentDirective | null;
  text: string;
} {
  const marker = /<!--\s*INBOXOS_CALENDAR\s+([\s\S]*?)\s*-->/i.exec(text);
  if (!marker) return { directive: null, text };
  try {
    const raw = JSON.parse(marker[1] ?? "") as Record<string, unknown>;
    const action = raw["action"];
    if (
      action === "cancel" &&
      typeof raw["appointmentId"] === "string" &&
      UUID.test(raw["appointmentId"])
    ) {
      return {
        directive: { action, appointmentId: raw["appointmentId"] },
        text: text.replace(marker[0], "").trim(),
      };
    }
    if (
      (action === "reschedule" || action === "create") &&
      typeof raw["startsAt"] === "string" &&
      typeof raw["endsAt"] === "string" &&
      Number.isFinite(Date.parse(raw["startsAt"])) &&
      Number.isFinite(Date.parse(raw["endsAt"])) &&
      Date.parse(raw["endsAt"]) > Date.parse(raw["startsAt"])
    ) {
      if (
        action === "reschedule" &&
        typeof raw["appointmentId"] === "string" &&
        UUID.test(raw["appointmentId"])
      ) {
        return {
          directive: {
            action,
            appointmentId: raw["appointmentId"],
            startsAt: new Date(raw["startsAt"]).toISOString(),
            endsAt: new Date(raw["endsAt"]).toISOString(),
          },
          text: text.replace(marker[0], "").trim(),
        };
      }
      if (action === "create" && typeof raw["title"] === "string" && raw["title"].trim()) {
        return {
          directive: {
            action,
            ...(typeof raw["calendarId"] === "string" && UUID.test(raw["calendarId"])
              ? { calendarId: raw["calendarId"] }
              : {}),
            title: raw["title"].trim().slice(0, 200),
            startsAt: new Date(raw["startsAt"]).toISOString(),
            endsAt: new Date(raw["endsAt"]).toISOString(),
          },
          text: text.replace(marker[0], "").trim(),
        };
      }
    }
  } catch {
    // Invalid model directives stay visible to the operator only through the
    // sanitized run log; the original customer text is preserved.
  }
  return { directive: null, text };
}
