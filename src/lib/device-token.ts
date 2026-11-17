export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const KEY = "inboxos.device_token";
function secureFactory(): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function")
    throw new Error("Secure random source unavailable");
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function getOrCreateDeviceToken(
  storage: StorageLike,
  factory: () => string = secureFactory,
) {
  const e = storage.getItem(KEY)?.trim();
  if (e) return e;
  const n = factory();
  storage.setItem(KEY, n);
  return n;
}
export function browserDeviceToken() {
  if (typeof window === "undefined") throw new Error("Device token requires a browser");
  return getOrCreateDeviceToken(window.localStorage);
}
