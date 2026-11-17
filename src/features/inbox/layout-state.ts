import type { AppView } from "./navigation.ts";

export interface InboxCompositionInput {
  isDesktop: boolean;
  currentView: AppView;
  hasActiveChat: boolean;
}
export interface InboxComposition {
  showConversationList: boolean;
  showChatPane: boolean;
  showMobileDock: boolean;
}

export function resolveInboxComposition({
  isDesktop,
  currentView,
  hasActiveChat,
}: InboxCompositionInput): InboxComposition {
  if (currentView !== "inbox")
    return { showConversationList: false, showChatPane: false, showMobileDock: !isDesktop };
  if (isDesktop) return { showConversationList: true, showChatPane: true, showMobileDock: false };
  return {
    showConversationList: !hasActiveChat,
    showChatPane: hasActiveChat,
    showMobileDock: !hasActiveChat,
  };
}
