/**
 * Preview host allow-list shared by remote smoke gates.
 *
 * A bare `project.vercel.app` alias can point at production, so it is not a
 * safe staging target. Vercel deployment hosts contain a generated alphanumeric
 * segment (normally with digits) after the project name. This is still only a
 * shape check; the caller must compare against production and verify the
 * deployment's environment/database independently.
 */
const vercelHostPattern = /^[a-z0-9][a-z0-9-]*\.vercel\.app$/i;

export function isIsolatedPreviewHost(hostname) {
  const value = String(hostname ?? "").toLowerCase();
  if (!vercelHostPattern.test(value)) return false;

  const stem = value.slice(0, -".vercel.app".length);
  const segments = stem.split("-");
  if (segments.length < 2) return false;

  // Require a deployment-like segment instead of accepting a project alias or
  // a friendly branch name such as `project-preview.vercel.app`.
  return segments.slice(1).some((segment) => segment.length >= 8 && /[0-9]/.test(segment));
}
