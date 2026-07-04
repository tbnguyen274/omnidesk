"use client";

/* eslint-disable react-hooks/exhaustive-deps -- Data loaders intentionally close over the current selection and filters; this preserves the pre-refactor fetch behavior. */

import { useEffect, useState } from "react";
import { type AgentTypingRealtimeEvent, type RealtimeEvent } from "@omnidesk/shared";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useRealtime } from "@/lib/use-realtime";
import type {
  ConversationDetail,
  ConversationFilters,
  ConversationListItem,
  ConversationStatus,
  Priority,
} from "@/lib/api-types";
import {
  createOutboundMessagePayload,
  dedupeById,
  getInboxErrorMessage,
  getReplyDisabledReason,
  normalizeConversationDetail,
  shouldRefreshConversationList,
} from "@/features/inbox/inbox-model";

export function useInboxController() {
  const { token, currentUser } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [typingAgents, setTypingAgents] = useState<{ [conversationId: string]: string[] }>({});
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; email: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const replyDisabledReason = selectedConversation
    ? getReplyDisabledReason(selectedConversation)
    : null;

  const { connectionState, sendTyping } = useRealtime({
    conversationId: selectedId,
    onEvents: handleRealtimeEvents,
    token,
  });
  const realtimeFallbackActive =
    connectionState === "disconnected" || connectionState === "error";

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    void loadAgents(token);
    void loadTags(token);
    void loadConversations(token, filters);
  }, [token, currentUser, filters.channelType, filters.status, filters.priority]);

  useEffect(() => {
    if (!token || !selectedId) {
      return;
    }

    void loadConversation(token, selectedId);
  }, [token, selectedId]);

  useEffect(() => {
    if (!token || !currentUser || !realtimeFallbackActive) {
      return;
    }

    const pollInterval = window.setInterval(() => {
      void loadConversations(token, filters);

      if (selectedId) {
        void loadConversation(token, selectedId);
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

  async function loadAgents(accessToken: string) {
    try {
      const data = await apiClient.getAgents(accessToken);
      setAgents(data);
    } catch (caught) {
      console.error("Failed to load agents", caught);
    }
  }

  async function loadTags(accessToken: string) {
    try {
      const data = await apiClient.getTags(accessToken);
      setTags(data);
    } catch (caught) {
      console.error("Failed to load tags", caught);
    }
  }

  async function loadConversations(
    accessToken: string,
    nextFilters: ConversationFilters,
  ) {
    setListLoading(true);
    setError(null);

    try {
      const data = await apiClient.conversations(accessToken, nextFilters);
      const nextItems = dedupeById(data.items);
      setConversations(nextItems);
      const nextSelectedId =
        selectedId && nextItems.some((item) => item.id === selectedId)
          ? selectedId
          : nextItems[0]?.id ?? null;
      setSelectedId(nextSelectedId);

      if (!nextSelectedId) {
        setSelectedConversation(null);
      }
    } catch (caught) {
      setError(getInboxErrorMessage(caught));
    } finally {
      setListLoading(false);
    }
  }

  async function loadConversation(accessToken: string, id: string) {
    setDetailLoading(true);
    setError(null);

    try {
      const conversation = await apiClient.conversation(accessToken, id);
      setSelectedConversation(normalizeConversationDetail(conversation));
    } catch (caught) {
      setError(getInboxErrorMessage(caught));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleLoadOlderMessages() {
    if (!token || !selectedConversation) return;

    if (!selectedConversation.messages.length) return;

    const oldestMessage = selectedConversation.messages[0];
    const cursor = oldestMessage.id;

    await runConversationAction(async () => {
      const olderMessages = await apiClient.getConversationMessages(token, selectedConversation.id, cursor);
      
      if (olderMessages.length > 0) {
        setSelectedConversation(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [...olderMessages, ...prev.messages]
          };
        });
      }
    });
  }

  async function handleUpdateReadStatus(isRead: boolean) {
    if (!token || !selectedConversation) return;

    await runConversationAction(async () => {
      await apiClient.updateConversationReadStatus(
        token,
        selectedConversation.id,
        isRead,
        selectedConversation.version,
      );
    });
  }

  async function handleRealtimeEvents(events: RealtimeEvent[]) {
    if (!token || events.length === 0) {
      return;
    }

    const shouldRefreshList = events.some(shouldRefreshConversationList);
    const shouldRefreshDetail =
      selectedId !== null &&
      events.some((event) => event.conversationId === selectedId && event.type !== 'agent.typing');

    events.forEach(event => {
      if (event.type === 'agent.typing') {
        const e = event as AgentTypingRealtimeEvent;
        setTypingAgents((prev) => {
          const agents = prev[e.conversationId] || [];
          const agentIndex = agents.indexOf(e.agentName);
          if (e.isTyping && agentIndex === -1) {
            return { ...prev, [e.conversationId]: [...agents, e.agentName] };
          } else if (!e.isTyping && agentIndex !== -1) {
            return { ...prev, [e.conversationId]: agents.filter((a) => a !== e.agentName) };
          }
          return prev;
        });
      }
    });

    await Promise.all([
      shouldRefreshList
        ? loadConversations(token, filters)
        : Promise.resolve(),
      shouldRefreshDetail
        ? loadConversation(token, selectedId)
        : Promise.resolve(),
    ]);
  }

  async function handleSearchSubmit(search: string) {
    if (!token) {
      return;
    }

    const nextFilters = {
      ...filters,
      search: search.trim() || undefined,
    };
    setFilters(nextFilters);
    await loadConversations(token, nextFilters);
  }

  async function handleStatusChange(status: ConversationStatus) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.updateConversationStatus(
        token,
        selectedConversation.id,
        status,
        selectedConversation.version,
      );
    });
  }

  async function handlePriorityChange(priority: Priority) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.updateConversationPriority(
        token,
        selectedConversation.id,
        priority,
        selectedConversation.version,
      );
    });
  }

  async function handleAssignToMe() {
    if (!token || !selectedConversation || !currentUser) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.assignConversation(
        token,
        selectedConversation.id,
        currentUser.id,
        selectedConversation.version,
      );
    });
  }

  async function handleUnassign() {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.assignConversation(
        token,
        selectedConversation.id,
        null,
        selectedConversation.version,
      );
    });
  }

  async function handleAssignAgent(agentId: string) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.assignConversation(
        token,
        selectedConversation.id,
        agentId,
        selectedConversation.version,
      );
    });
  }

  async function handleSendReply(content: string, replyToExternalId?: string | null) {
    if (!token || !selectedConversation) {
      return;
    }

    const payload = createOutboundMessagePayload(
      selectedConversation,
      content,
      replyToExternalId,
    );

    await apiClient.createOutboundMessage(token, payload);
    await Promise.all([
      loadConversations(token, filters),
      loadConversation(token, selectedConversation.id),
    ]);
  }

  async function handleAddTag(tagId: string) {
    if (!token || !selectedConversation) return;

    await runConversationAction(async () => {
      await apiClient.addConversationTag(token, selectedConversation.id, tagId);
    });
  }

  async function handleCreateTag(name: string, color?: string) {
    if (!token || !selectedConversation) return;

    await runConversationAction(async () => {
      const newTag = await apiClient.createTag(token, name, color);
      // reload tags
      void loadTags(token);
      await apiClient.addConversationTag(token, selectedConversation.id, newTag.id);
    });
  }

  async function handleRemoveTag(tagId: string) {
    if (!token || !selectedConversation) return;

    await runConversationAction(async () => {
      await apiClient.removeConversationTag(token, selectedConversation.id, tagId);
    });
  }

  async function runConversationAction(action: () => Promise<void>) {
    if (!token || !selectedConversation) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      await action();
      await Promise.all([
        loadConversations(token, filters),
        loadConversation(token, selectedConversation.id),
      ]);
    } catch (caught) {
      setError(getInboxErrorMessage(caught));
    } finally {
      setActionLoading(false);
    }
  }

  return {
    actionLoading,
    agents,
    conversations,
    currentUser,
    detailLoading,
    error,
    filters,
    listLoading,
    replyDisabledReason,
    selectedConversation,
    selectedId,
    tags,
    typingAgents,
    handleAddTag,
    handleAssignAgent,
    handleAssignToMe,
    handleCreateTag,
    handleLoadOlderMessages,
    handlePriorityChange,
    handleRemoveTag,
    handleSearchSubmit,
    handleSendReply,
    handleStatusChange,
    handleUnassign,
    handleUpdateReadStatus,
    refreshConversations: () => {
      if (token) {
        void loadConversations(token, filters);
      }
    },
    selectConversation: setSelectedId,
    sendTyping,
    setFilters,
  };
}
