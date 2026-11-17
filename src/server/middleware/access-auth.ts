/**
 * Rejects browser mutations that are explicitly cross-site.
 * Authentication and authorization are handled by the Supabase/App session middleware.
 */
export function mutationOriginAllowed(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}
