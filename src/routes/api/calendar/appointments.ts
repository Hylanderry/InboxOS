import { createFileRoute } from "@tanstack/react-router";
import { mutateAppointment } from "@/server/product/calendar-clients.server";

export const Route = createFileRoute("/api/calendar/appointments")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        mutateAppointment(request, await request.json().catch(() => null)),
      PATCH: async ({ request }) =>
        mutateAppointment(request, await request.json().catch(() => null)),
    },
  },
});
