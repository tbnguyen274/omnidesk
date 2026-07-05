"use client";

/* eslint-disable react-hooks/exhaustive-deps -- Data loaders intentionally close over the current selection and filters; this preserves the pre-refactor fetch behavior. */

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  dedupeById,
  getInboxErrorMessage,
  getReplyDisabledReason,
  normalizeConversationDetail,
} from "@/features/inbox/inbox-model";
import { useConversationActions } from "@/features/inbox/hooks/use-conversation-actions";
import { useInboxRealtime } from "@/features/inbox/hooks/use-inbox-realtime";
import type {
  ConversationDetail,
  ConversationFilters,
  ConversationListItem,
} from "@/lib/api-types";

export function useInboxController() {
  const { token, currentUser } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; email: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const replyDisabledReason = selectedConversation
    ? getReplyDisabledReason(selectedConversation)
    : null;

  const {
    actionLoading,
    handleAddTag,
    handleAssignAgent,
    handleAssignToMe,
    handleCreateTag,
    handleLoadOlderMessages,
    handlePriorityChange,
    handleRemoveTag,
    handleSendReply,
    handleStatusChange,
    handleUnassign,
    handleUpdateReadStatus,
  } = useConversationActions({
    currentUser,
    filters,
    loadConversation,
    loadConversations,
    loadTags,
    selectedConversation,
    setError,
    setSelectedConversation,
    token,
  });

  const { sendTyping, typingAgents } = useInboxRealtime({
    currentUser,
    filters,
    onRefreshDetail: refreshConversationById,
    onRefreshList: refreshConversations,
    selectedId,
    token,
  });

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

  async function refreshConversations() {
    if (token) {
      await loadConversations(token, filters);
    }
  }

  async function refreshConversationById(conversationId: string) {
    if (token) {
      await loadConversation(token, conversationId);
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
    refreshConversations,
    selectConversation: setSelectedId,
    sendTyping,
    setFilters,
  };
}
