interface ReadPolicyInput {
  unread: number;
  selectionSource: "automatic" | "user";
  timelineVisible: boolean;
}

export function shouldMarkChatRead(input: ReadPolicyInput): boolean {
  // A conversation is read when it is actually visible, regardless of whether
  // it was opened by the operator or selected as the desktop default.
  return input.timelineVisible && input.unread > 0;
}
