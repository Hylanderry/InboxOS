import { createFileRoute } from "@tanstack/react-router";
import {
  deleteAppointment,
  listCalendar,
  mutateAppointment,
  mutateCalendar,
} from "@/server/product/calendar-clients.server";

export const Route = createFileRoute("/api/calendar/")({
  server: {
    handlers: {
      GET: ({ request }) => listCalendar(request),
      POST: async ({ request }) => mutateCalendar(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) => mutateCalendar(request, await request.json().catch(() => null)),
      DELETE: ({ request }) => deleteAppointment(request),
    },
  },
});
