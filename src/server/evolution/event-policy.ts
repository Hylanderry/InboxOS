export function shouldIncrementUnread(event: string, fromMe: boolean): boolean {
  if (fromMe) return false;

  const normalized = event.trim().toUpperCase().replace(/[.-]/g, "_");
  return normalized === "MESSAGES_UPSERT" || normalized === "SEND_MESSAGE";
}
