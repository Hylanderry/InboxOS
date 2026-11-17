type GuardOptions = { ttlMs?: number; maxConcurrent?: number; maxQueued?: number };

export function createGroqGuard(options: GuardOptions = {}) {
  const ttlMs = Math.max(1000, options.ttlMs ?? 15_000);
  const maxConcurrent = Math.max(1, Math.floor(options.maxConcurrent ?? 2));
  const maxQueued = Math.max(maxConcurrent, Math.floor(options.maxQueued ?? 50));
  const cache = new Map<string, { expiresAt: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let active = 0;

  const drain = () => {
    while (active < maxConcurrent && queue.length) queue.shift()?.();
  };

  async function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (cached) cache.delete(key);
    const current = inflight.get(key);
    if (current) return current as Promise<T>;
    if (queue.length >= maxQueued) throw new Error("groq_queue_saturated");

    const promise = new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active += 1;
        void operation()
          .then((value) => {
            cache.set(key, { expiresAt: Date.now() + ttlMs, value });
            resolve(value);
          })
          .catch(reject)
          .finally(() => {
            active -= 1;
            inflight.delete(key);
            drain();
          });
      });
      drain();
    });
    inflight.set(key, promise);
    return promise;
  }

  return { run };
}

export const groqGuard = createGroqGuard();
