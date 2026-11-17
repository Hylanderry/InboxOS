/**
 * Atualizações assíncronas não devem contaminar a conversa ativa quando o operador
 * alterna para outro chat antes da conclusão de um envio / evento em tempo real.
 * Função pura para permitir testes sem React e sem tocar no banco.
 */
export function applyChatScopedUpdate<T>(
  activeChatId: string | null,
  targetChatId: string,
  visibleMessages: T[],
  cachedTargetMessages: T[],
  update: (messages: T[]) => T[],
): { visible: T[]; target: T[] } {
  const isActive = activeChatId === targetChatId;
  const target = update(isActive ? visibleMessages : cachedTargetMessages);
  return { visible: isActive ? target : visibleMessages, target };
}
