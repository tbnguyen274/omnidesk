"use client";

import { useLayoutEffect, useRef, useState } from "react";

export function useMessagePagination({
  conversationId,
  messageCount,
  onLoadOlderMessages,
  onPrepareScroll,
}: {
  conversationId?: string | null;
  messageCount: number;
  onLoadOlderMessages?: () => Promise<void>;
  onPrepareScroll?: () => void;
}) {
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const currentConversationIdRef = useRef<string | null>(null);
  const messageCountRef = useRef(messageCount);
  messageCountRef.current = messageCount;

  useLayoutEffect(() => {
    if (conversationId !== currentConversationIdRef.current) {
      currentConversationIdRef.current = conversationId ?? null;
      setHasMoreMessages(true);
    }
  }, [conversationId]);

  const loadOlder = async (currentScrollTop: number) => {
    if (!onLoadOlderMessages || isLoadingOlder || !hasMoreMessages) return;

    if (currentScrollTop === 0) {
      const prevMessageCount = messageCountRef.current;
      onPrepareScroll?.();
      setIsLoadingOlder(true);

      try {
        await onLoadOlderMessages();
      } finally {
        setIsLoadingOlder(false);
      }

      // If no new messages were added after loading, we have reached the end
      if (messageCountRef.current === prevMessageCount) {
        setHasMoreMessages(false);
      }
    }
  };

  return {
    isLoadingOlder,
    hasMoreMessages,
    loadOlder,
  };
}
