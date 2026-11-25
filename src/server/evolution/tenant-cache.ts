/**
 * Cache em memória particionado por workspace.
 *
 * As chaves seguem o formato de `scopedIdentityKey`: `${workspaceId}:${instance}:${identity}`.
 * Cada workspace tem sua própria partição, com limite de entradas (descarta as mais antigas)
 * e limpeza explícita. Um container serverless reaproveitado nunca mistura workspaces
 * nem cresce sem limite.
 */
export class TenantCache<V> {
  private readonly partitions = new Map<string, Map<string, V>>();
  private hits = 0;
  private misses = 0;

  private readonly maxPerWorkspace: number;

  constructor(maxPerWorkspace = 20000) {
    this.maxPerWorkspace = maxPerWorkspace;
  }

  private static workspaceOf(key: string): string {
    const idx = key.indexOf(":");
    return idx > 0 ? key.slice(0, idx) : "";
  }

  get(key: string): V | undefined {
    const ws = TenantCache.workspaceOf(key);
    const value = ws ? this.partitions.get(ws)?.get(key) : undefined;
    if (value === undefined) this.misses++;
    else this.hits++;
    return value;
  }

  set(key: string, value: V): void {
    const ws = TenantCache.workspaceOf(key);
    if (!ws) return; // chave sem workspace nunca é armazenada
    let part = this.partitions.get(ws);
    if (!part) {
      part = new Map();
      this.partitions.set(ws, part);
    }
    part.delete(key); // reinsere para manter ordem de recência
    part.set(key, value);
    if (part.size > this.maxPerWorkspace) {
      const oldest = part.keys().next().value;
      if (oldest !== undefined) part.delete(oldest);
    }
  }

  clearWorkspace(workspaceId: string): void {
    this.partitions.delete(workspaceId);
  }

  sizeOf(workspaceId: string): number {
    return this.partitions.get(workspaceId)?.size ?? 0;
  }

  stats(workspaceId?: string) {
    return {
      hits: this.hits,
      misses: this.misses,
      workspaces: this.partitions.size,
      ...(workspaceId ? { workspaceId, size: this.sizeOf(workspaceId) } : {}),
    };
  }
}
