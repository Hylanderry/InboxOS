import { toast } from "sonner";
import { friendlyErrorText } from "@/lib/friendly-error";

function feedbackDetail(value: string | undefined, fallback: string) {
  return friendlyErrorText(value, fallback);
}

function cleanTitle(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

/** Feedback visual unificado do InboxOS. Mensagens curtas, acionáveis e iguais nos dois temas. */
export const WhatsAppToast = {
  instanceDisconnected(instanceName: string, onReconnect?: () => void) {
    toast.error("Conexão desconectada", {
      description: `A instância ${instanceName} está desconectada. Reconecte pelo QR Code para voltar a receber mensagens.`,
      duration: 8000,
      id: `instance-disconnected:${instanceName}`,
      action: onReconnect
        ? {
            label: "Reconectar",
            onClick: onReconnect,
          }
        : undefined,
    });
  },

  sendFailed(contactName: string, reason?: string, onRetry?: () => void) {
    toast.error("Mensagem não enviada", {
      description: feedbackDetail(
        reason,
        `Não foi possível enviar a mensagem para ${contactName}. Tente novamente.`,
      ),
      duration: 6000,
      id: `message-send:${contactName}`,
      action: onRetry
        ? {
            label: "Tentar de novo",
            onClick: onRetry,
          }
        : undefined,
    });
  },

  fileTooLarge(maxSizeMB = 45) {
    toast.warning("Arquivo acima do limite", {
      description: `Escolha um arquivo de até ${maxSizeMB} MB para enviar.`,
      duration: 6000,
    });
  },

  qrCodeExpired(onRefresh?: () => void) {
    toast.info("Código expirado", {
      description: "Gere um novo QR Code para conectar esta instância.",
      duration: 7000,
      id: "instance-qrcode-expired",
      action: onRefresh
        ? {
            label: "Gerar novo código",
            onClick: onRefresh,
          }
        : undefined,
    });
  },

  networkError(message?: string) {
    toast.error("Conexão indisponível", {
      description: feedbackDetail(
        message,
        "Não foi possível concluir agora. Verifique a conexão e tente novamente.",
      ),
      duration: 5000,
      id: "inbox-network-error",
    });
  },

  success(message: string, description?: string) {
    toast.success(cleanTitle(message), {
      description: feedbackDetail(description, "A alteração foi salva."),
      duration: 3500,
    });
  },

  error(message: string, description?: string) {
    toast.error(cleanTitle(message), {
      description: feedbackDetail(
        description,
        "Não foi possível concluir a ação. Tente novamente.",
      ),
      duration: 5000,
    });
  },

  info(message: string, description?: string) {
    toast.info(cleanTitle(message), {
      description: feedbackDetail(
        description,
        "Confira a informação e continue quando estiver pronto.",
      ),
      duration: 4000,
    });
  },

  warning(message: string, description?: string) {
    toast.warning(cleanTitle(message), {
      description: feedbackDetail(description, "Revise os dados antes de continuar."),
      duration: 4500,
    });
  },
};
