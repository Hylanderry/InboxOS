export type MessageType = "text" | "image" | "video" | "audio" | "document" | "sticker" | "deleted";

export type MessageSender = "client" | "agent" | "system";

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface MessageReaction {
  emoji: string;
  senderPhone?: string | undefined;
  at?: string | undefined;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  externalId?: string | null | undefined;
  clientMessageId?: string | null | undefined;
  sender: MessageSender;
  senderName?: string | null | undefined;
  senderPhone?: string | null | undefined;
  senderAvatar?: string | null | undefined;
  quotedMessage?:
    | {
        senderName?: string | null | undefined;
        senderPhone?: string | null | undefined;
        text?: string | null | undefined;
        type?: string | null | undefined;
        isEdited?: boolean | undefined;
        reactions?: MessageReaction[] | undefined;
      }
    | null
    | undefined;
  isEdited?: boolean | undefined;
  reactions?: MessageReaction[] | undefined;
  isGif?: boolean | undefined;
  type: MessageType;
  text: string;
  mediaUrl?: string | null | undefined;
  mediaPath?: string | null | undefined;
  audioUrl?: string | null | undefined;
  fileUrl?: string | null | undefined;
  fileName?: string | null | undefined;
  fileSize?: string | null | undefined;
  duration?: number | null | undefined;
  mimetype?: string | null | undefined;
  time: string;
  createdAt: string;
  status: MessageStatus;
  failedReason?: string | null | undefined;
}

export interface ChatTag {
  id: string;
  label: string;
  color: string;
}

export interface Conversation {
  id: string;
  conversationKey: string;
  workspaceId: string;
  instanceId?: string | null | undefined;
  instanceName: string;
  phone: string;
  name: string;
  avatar?: string | null | undefined;
  lastMessage: string;
  lastMessageType: MessageType;
  time: string;
  timestamp: string;
  unread: number;
  online?: boolean | undefined;
  pinned: boolean;
  archived: boolean;
  tag?: string | null | undefined;
  isGroup: boolean;
  aiPaused: boolean;
  typing?: boolean | undefined;
  recordingAudio?: boolean | undefined;
  isAnnouncement?: boolean | undefined;
  canSend?: boolean | undefined;
  isAdmin?: boolean | undefined;
  leadId?: string | null | undefined;
  contactCategory?: "lead" | "personal" | "group" | undefined;
  humanHandoff?: boolean | undefined;
  handoverPriority?: "low" | "normal" | "high" | string | null | undefined;
  handoverRequestedAt?: string | null | undefined;
  handoverSla?: "pending" | "attention" | "overdue" | null | undefined;
  handoverStatus?: "queued" | "assigned" | "in_progress" | string | null | undefined;
}

export interface WhatsAppInstance {
  id: string;
  instanceName: string;
  alias?: string | undefined;
  state: "open" | "connecting" | "disconnected" | "close";
  phone?: string | null | undefined;
  profilePicUrl?: string | null | undefined;
}

export interface InboxFilters {
  searchQuery: string;
  selectedAccountId: string;
  showArchived: boolean;
  onlyUnread: boolean;
  showGroups: boolean;
  typeFilter?: "all" | "direct" | "groups";
  audienceFilter?: "all" | "leads" | "personal";
  tagFilter: string | null;
}
