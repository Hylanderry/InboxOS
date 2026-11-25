/**
 * Guardrail para o cliente service_role (que ignora RLS).
 *
 * `createScopedAdmin(client, workspaceId)` devolve um acessor cujas queries são
 * sempre limitadas a um workspace:
 *  - select / update / delete recebem `.eq("workspace_id", workspaceId)` automaticamente;
 *  - insert / upsert recebem `workspace_id` em cada linha e falham se a linha trouxer
 *    outro workspace.
 *
 * Só aceita tabelas cuja Row possui `workspace_id`. Código novo deve usar
 * `scopedAdmin(workspaceId)` (client.server) em vez de `supabaseAdmin` direto.
 */
import type { Database } from "./types";

type Tables = Database["public"]["Tables"];
export type ScopedTable = {
  [K in keyof Tables]: Tables[K]["Row"] extends { workspace_id: string } ? K : never;
}[keyof Tables];

const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertWorkspaceId(workspaceId: unknown): asserts workspaceId is string {
  if (typeof workspaceId !== "string" || !WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error("scopedAdmin: workspaceId inválido ou ausente");
  }
}

function stamp<R>(rows: R, workspaceId: string): R {
  const apply = (row: unknown) => {
    const record = (row ?? {}) as Record<string, unknown>;
    const current = record["workspace_id"];
    if (current !== undefined && current !== workspaceId) {
      throw new Error("scopedAdmin: linha pertence a outro workspace");
    }
    return { ...record, workspace_id: workspaceId };
  };
  return (Array.isArray(rows) ? rows.map(apply) : apply(rows)) as R;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

export function createScopedAdmin(client: AnyClient, workspaceId: string) {
  assertWorkspaceId(workspaceId);
  return {
    workspaceId,
    from(table: ScopedTable) {
      const q = client.from(table);
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: (...args: any[]) => q.select(...args).eq("workspace_id", workspaceId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insert: (rows: any, ...rest: any[]) => q.insert(stamp(rows, workspaceId), ...rest),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: (rows: any, ...rest: any[]) => q.upsert(stamp(rows, workspaceId), ...rest),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (values: any, ...rest: any[]) =>
          q.update(stamp(values, workspaceId), ...rest).eq("workspace_id", workspaceId),
        delete: (...args: unknown[]) => q.delete(...args).eq("workspace_id", workspaceId),
      };
    },
  };
}
