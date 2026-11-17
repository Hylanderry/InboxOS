/**
 * Converts infrastructure/provider errors into stable, non-sensitive API
 * messages. Database and provider messages can contain schema details, query
 * fragments, phone numbers or customer text and must not be sent to browsers.
 */
export function safePublicError(error: unknown, fallback: string): string {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown })["message"] ?? "")
      : error instanceof Error
        ? error.message
        : "";
  const normalized = raw.toLowerCase();
  if (!raw) return fallback;
  if (normalized.includes("calendar_appointment_overlap")) return "Este horário já está ocupado";
  if (normalized.includes("unique") || normalized.includes("duplicate"))
    return "Este registro já existe";
  if (normalized.includes("permission denied") || normalized.includes("forbidden"))
    return "Operação não permitida";
  if (normalized.includes("not found") || normalized.includes("does not exist"))
    return "Registro não encontrado";
  if (normalized.includes("timeout") || normalized.includes("timed out"))
    return "O serviço demorou para responder";
  return fallback;
}
