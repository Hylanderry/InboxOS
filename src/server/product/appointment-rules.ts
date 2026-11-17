export interface AppointmentWindow {
  startsAt: string;
  endsAt: string;
}

export interface AppointmentLike {
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

const ACTIVE_STATUSES = new Set(["scheduled", "confirmed"]);

export function appointmentOverlaps(
  a: AppointmentWindow,
  b: AppointmentWindow,
  bufferMinutes = 0,
): boolean {
  const aStart = Date.parse(a.startsAt);
  const aEnd = Date.parse(a.endsAt);
  const bStart = Date.parse(b.startsAt);
  const bEnd = Date.parse(b.endsAt);
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite) || aEnd <= aStart || bEnd <= bStart)
    return false;
  const bufferMs = Math.max(0, Math.floor(bufferMinutes)) * 60_000;
  return aStart < bEnd + bufferMs && bStart < aEnd + bufferMs;
}

export function countBookedAppointments(appointments: readonly AppointmentLike[]): number {
  return appointments.filter((appointment) => ACTIVE_STATUSES.has(String(appointment.status)))
    .length;
}

export function appointmentFitsCapacity(
  appointments: readonly AppointmentLike[],
  dailyCapacity: number,
): boolean {
  const capacity = Math.max(0, Math.floor(dailyCapacity));
  return countBookedAppointments(appointments) < capacity;
}
