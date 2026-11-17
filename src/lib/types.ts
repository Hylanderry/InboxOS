/**
 * Tipos e Contratos Estruturados para o Painel WhatsApp Open-Source
 */

export interface Account {
  id: string;
  name: string;
  alias: string;
  number: string;
  profilePicUrl?: string | null;
  state: "open" | "connecting" | "disconnected" | "close";
}

export interface ChatMessage {
  id: string;
  sender: "client" | "agent" | "human" | "system";
  type: "text" | "audio" | "image" | "video" | "file";
  text?: string;
  mediaUrl?: string | null;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  time: string;
  status: "pending" | "sent" | "delivered" | "read";
}

export interface Chat {
  id: string;
  phone: string;
  name: string;
  accountId: string;
  instanceName: string;
  avatar?: string;
  lastMessage: string;
  lastMessageType: "text" | "audio" | "image" | "video" | "file";
  time: string;
  unread: number;
  online: boolean;
  typing?: boolean;
  recordingAudio?: boolean;
  pinned: boolean;
  archived: boolean;
  tag?: string;
  messages: ChatMessage[];
}

export interface ClientLongTermMemory {
  phone: string;
  name: string;
  status: string;
  tags: string[];
  keyFacts: Record<string, unknown>;
  preferences: Record<string, unknown>;
  summary: string;
  sentiment: "positive" | "neutral" | "negative" | "churning";
  interactionCount: number;
  lastInteractionAt: string;
}

export interface EvolutionQrResponse {
  state: string;
  instanceName: string;
  code?: string | null;
  base64?: string | null;
  qrcode?: string | null;
  pairingCode?: string | null;
  error?: string;
}
