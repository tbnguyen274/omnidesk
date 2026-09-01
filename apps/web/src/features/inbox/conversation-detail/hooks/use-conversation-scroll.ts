"use client";

import { useLayoutEffect, useRef } from "react";
import type { ConversationMessage } from "@/lib/api-types";

const SCROLL_BOTTOM_THRESHOLD = 120;

export function isNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    SCROLL_BOTTOM_THRESHOLD
  );
}

export function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

export function useConversationScroll({
  conversationId,
  messages,
}: {
  conversationId?: string | null;
  messages: ConversationMessage[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const shouldStickToBottomRef = useRef(true);
  const isAdjustingScrollRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const currentConversationIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (conversationId !== currentConversationIdRef.current) {
      isInitialLoadRef.current = true;
      shouldStickToBottomRef.current = true;
      currentConversationIdRef.current = conversationId ?? null;
    }
  }, [conversationId]);

  useLayoutEffect(() => {
    if (scrollRef.current) {
      if (isAdjustingScrollRef.current) {
        // Adjust scroll position after loading older messages so the view doesn't jump
        const newScrollHeight = scrollRef.current.scrollHeight;
        scrollRef.current.scrollTop =
          newScrollHeight - previousScrollHeightRef.current;
        isAdjustingScrollRef.current = false;
      } else if (
        isInitialLoadRef.current ||
        shouldStickToBottomRef.current
      ) {
        // Only auto-scroll to bottom if the user was already near the bottom OR it's the initial load
        scrollToBottom(scrollRef.current);
        if (messages.length > 0) {
          isInitialLoadRef.current = false;
        }
      }
    }
  }, [messages, conversationId]);

  const prepareForOlderMessages = () => {
    if (scrollRef.current) {
      previousScrollHeightRef.current = scrollRef.current.scrollHeight;
      isAdjustingScrollRef.current = true;
      shouldStickToBottomRef.current = false;
    }
  };

  const updateStickToBottom = () => {
    if (scrollRef.current) {
      shouldStickToBottomRef.current = isNearBottom(scrollRef.current);
    }
  };

  return {
    scrollRef,
    prepareForOlderMessages,
    updateStickToBottom,
  };
}
