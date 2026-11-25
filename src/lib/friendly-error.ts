/**
 * Mensagens técnicas de rede/HTTP ("Failed to fetch", "HTTP 500", "TypeError…") nunca devem
 * chegar ao usuário. Textos já escritos em português para pessoas são mantidos.
 */
const TECHNICAL = /^(http|status|error|failed|fetch|network|typeerror|networkerror|load failed)\b/i;

export const GENERIC_LOAD_ERROR = "Verifique a conexão e tente novamente.";

export function friendlyErrorText(value: string | null | undefined, fallback = GENERIC_LOAD_ERROR) {
  const normalized = String(value ?? "").trim();
  if (!normalized || TECHNICAL.test(normalized)) return fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}…` : normalized;
}
