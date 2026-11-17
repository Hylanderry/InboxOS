const INSTANCE_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$/;

export const INSTANCE_NAME_MAX_LENGTH = 80;
export const INSTANCE_DISPLAY_NAME_MAX_LENGTH = 80;

export function normalizeInstanceName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidInstanceName(value: unknown): value is string {
  const normalized = normalizeInstanceName(value);
  return (
    normalized.length >= 2 &&
    normalized.length <= INSTANCE_NAME_MAX_LENGTH &&
    INSTANCE_NAME_PATTERN.test(normalized)
  );
}

export function normalizeDisplayName(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, INSTANCE_DISPLAY_NAME_MAX_LENGTH);
}
