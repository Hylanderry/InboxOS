import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token de webhook POR INSTÂNCIA.
 *
 * Antes, um único segredo global autorizava eventos de qualquer instância e o tenant era
 * decidido só pelo nome vindo no corpo. Agora o segredo configurado na Evolution para cada
 * instância é derivado: HMAC-SHA256(segredo mestre, nome da instância). Um evento só é aceito
 * se o token apresentado corresponde ao nome da instância que ele declara — assim, quem
 * conhecer o token de uma instância não consegue injetar eventos em outra.
 *
 * Sem estado novo no banco: o token é recalculável a partir do mestre.
 */
const PREFIX = "inboxos-evolution-webhook-v1:";
const SHAPE = /^[0-9a-f]{64}$/;

export function instanceWebhookToken(masterSecret: string, instanceName: string): string {
  return createHmac("sha256", masterSecret).update(`${PREFIX}${instanceName.trim()}`).digest("hex");
}

export function isInstanceTokenShape(value: string | null | undefined): boolean {
  return SHAPE.test(String(value ?? ""));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type WebhookCredentialMatch = "instance" | "legacy" | null;

/**
 * - "instance": token derivado para ESTA instância (caminho seguro).
 * - "legacy": segredo global antigo, aceito só se `allowLegacy` (migração das instâncias
 *   que ainda não foram reconfiguradas). Desligar com EVOLUTION_WEBHOOK_LEGACY_TOKEN=deny.
 */
export function matchWebhookCredential(input: {
  provided: string | null | undefined;
  instanceName: string;
  masterSecrets: Array<string | null | undefined>;
  allowLegacy: boolean;
}): WebhookCredentialMatch {
  const provided = String(input.provided ?? "");
  const instanceName = input.instanceName.trim();
  if (!provided || !instanceName) return null;
  const masters = input.masterSecrets.filter((value): value is string => Boolean(value));
  let legacy = false;
  for (const master of masters) {
    if (safeEqual(provided, instanceWebhookToken(master, instanceName))) return "instance";
    if (safeEqual(provided, master)) legacy = true;
  }
  return legacy && input.allowLegacy ? "legacy" : null;
}
