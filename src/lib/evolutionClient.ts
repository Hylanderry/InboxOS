import { EvolutionQrResponse } from "./types";
import { apiFetch } from "./api-fetch";

// Rotas internas do próprio app
const BACKEND_URL = "";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro de rede desconhecido";
}

/**
 * Busca QR Code em tempo real da Evolution API
 */
export async function getLiveQrCode(instanceName: string): Promise<EvolutionQrResponse | null> {
  try {
    const res = await apiFetch(
      `${BACKEND_URL}/api/instances/${encodeURIComponent(instanceName)}/qrcode`,
    );
    if (!res.ok) return { state: "error", instanceName, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (error: unknown) {
    const message = errorMessage(error);
    console.warn(`[EvolutionClient] Erro ao buscar QR Code de ${instanceName}:`, message);
    return { state: "error", instanceName, error: message };
  }
}

/**
 * Cria uma nova instância
 */
export async function createNewInstance(instanceName: string) {
  try {
    const res = await apiFetch(`${BACKEND_URL}/api/instances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName }),
    });
    return await res.json();
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Envia mensagem de texto para o WhatsApp
 */
export async function sendWhatsAppMessage(phone: string, text: string, instanceName: string) {
  const scopedInstanceName = instanceName.trim();
  if (!scopedInstanceName) return { success: false, error: "instanceName is required" };
  try {
    const res = await apiFetch(`${BACKEND_URL}/api/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, text, instanceName: scopedInstanceName }),
    });
    return await res.json();
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Exclui uma instância
 */
export async function deleteWhatsAppInstance(instanceName: string) {
  try {
    const res = await apiFetch(`${BACKEND_URL}/api/instances/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    });
    return await res.json();
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}
