/**
 * All HTTP calls carrying server credentials must fail closed on redirects.
 * An upstream 30x can point at another host, and headers such as custom API
 * keys are not guaranteed to be removed by every fetch implementation.
 *
 * The transport parameter exists for deterministic tests without a network.
 */
export function fetchCredentialed(
  input: RequestInfo | URL,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<Response> {
  return transport(input, {
    ...init,
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
}
