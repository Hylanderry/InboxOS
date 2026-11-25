/**
 * Política de limite para mutações autenticadas (por usuário, janela de 60 s).
 *
 * Endpoints críticos (conexões WhatsApp, ADM, cobrança, integrações, membros/convites e
 * privacidade) têm um bucket PRÓPRIO e mais apertado. Assim, uma rajada de ações comuns
 * (enviar mensagens, mover leads) não consome a cota dos críticos, e abuso em um endpoint
 * crítico é contido cedo — inclusive tentativas de enumerar/derrubar instâncias.
 */
export interface MutationRateBucket {
  action: "api-mutation" | "api-mutation-critical";
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
}

const DEFAULT_BUCKET: MutationRateBucket = {
  action: "api-mutation",
  limit: 300,
  windowSeconds: 60,
  blockSeconds: 60,
};

const CRITICAL_BUCKET: MutationRateBucket = {
  action: "api-mutation-critical",
  limit: 40,
  windowSeconds: 60,
  blockSeconds: 120,
};

const CRITICAL_PATH =
  /^\/api\/(?:instances|admin|billing|privacy|workspaces\/[^/]+\/(?:members|invitations)|company)(?:\/|$)/;

export function mutationRateBucket(pathname: string): MutationRateBucket {
  return CRITICAL_PATH.test(pathname) ? CRITICAL_BUCKET : DEFAULT_BUCKET;
}
