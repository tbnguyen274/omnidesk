"use client";

/* eslint-disable react-hooks/exhaustive-deps -- Realtime callbacks intentionally use the latest controller state without making every loader stable. */

import { useEffect, useState } from "react";
import { type AgentTypingRealtimeEvent, type RealtimeEvent } from "@omnidesk/shared";
import { useRealtime } from "@/lib/use-realtime";
import { shouldRefreshConversationList } from "@/features/inbox/inbox-model";
import type { ConversationFilters, CurrentUser } from "@/lib/api-types";

type UseInboxRealtimeParams = {
  currentUser: CurrentUser | null;
  filters: ConversationFilters;
  onRefreshDetail: (conversationId: string) => Promise<void>;
  onRefreshList: () => Promise<void>;
  selectedId: string | null;
  token: string | null;
};

export function useInboxRealtime({
  currentUser,
  filters,
  onRefreshDetail,
  onRefreshList,
  selectedId,
  token,
}: UseInboxRealtimeParams) {
  const [typingAgents, setTypingAgents] = useState<{ [conversationId: string]: string[] }>({});

  const { connectionState, sendTyping } = useRealtime({
    conversationId: selectedId,
    onEvents: handleRealtimeEvents,
    token,
  });
  const realtimeFallbackActive =
    connectionState === "disconnected" || connectionState === "error";

  useEffect(() => {
    if (!token || !currentUser || !realtimeFallbackActive) {
      return;
    }

    const pollInterval = window.setInterval(() => {
      void onRefreshList();

      if (selectedId) {
        void onRefreshDetail(selectedId);
      }
    }, 10000);

    return () => window.clearInterval(pollInterval);
  }, [
    token,
    currentUser,
    realtimeFallbackActive,
    filters.channelType,
    filters.status,
    filters.priority,
    filters.search,
    selectedId,
  ]);

  async function handleRealtimeEvents(events: RealtimeEvent[]) {
    if (!token || events.length === 0) {
      return;
    }

    const shouldRefreshList = events.some(shouldRefreshConversationList);
    const shouldRefreshDetail =
      selectedId !== null &&
      events.some(
        (event) =>
          event.conversationId === selectedId && event.type !== "agent.typing",
      );

    for (const event of events) {
      if (event.type === "agent.typing") {
        updateTypingAgents(event as AgentTypingRealtimeEvent);
      }
    }

    await Promise.all([
      shouldRefreshList ? onRefreshList() : Promise.resolve(),
      shouldRefreshDetail && selectedId
        ? onRefreshDetail(selectedId)
        : Promise.resolve(),
    ]);
  }

  function updateTypingAgents(event: AgentTypingRealtimeEvent) {
    setTypingAgents((prev) => {
      const agents = prev[event.conversationId] || [];
      const agentIndex = agents.indexOf(event.agentName);

      if (event.isTyping && agentIndex === -1) {
        return {
          ...prev,
          [event.conversationId]: [...agents, event.agentName],
        };
      }

      if (!event.isTyping && agentIndex !== -1) {
        return {
          ...prev,
          [event.conversationId]: agents.filter((agent) => agent !== event.agentName),
        };
      }

      return prev;
    });
  }

  return {
    sendTyping,
    typingAgents,
  };
}
