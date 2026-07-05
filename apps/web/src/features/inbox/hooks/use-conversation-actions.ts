"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  createOutboundMessagePayload,
  getInboxErrorMessage,
} from "@/features/inbox/inbox-model";
import type {
  ConversationDetail,
  ConversationFilters,
  ConversationStatus,
  CurrentUser,
  Priority,
} from "@/lib/api-types";

type UseConversationActionsParams = {
  currentUser: CurrentUser | null;
  filters: ConversationFilters;
  loadConversation: (accessToken: string, id: string) => Promise<void>;
  loadConversations: (
    accessToken: string,
    nextFilters: ConversationFilters,
  ) => Promise<void>;
  loadTags: (accessToken: string) => Promise<void>;
  selectedConversation: ConversationDetail | null;
  setError: (message: string | null) => void;
  setSelectedConversation: (
    updater:
      | ConversationDetail
      | null
      | ((value: ConversationDetail | null) => ConversationDetail | null),
  ) => void;
  token: string | null;
};

export function useConversationActions({
  currentUser,
  filters,
  loadConversation,
  loadConversations,
  loadTags,
  selectedConversation,
  setError,
  setSelectedConversation,
  token,
}: UseConversationActionsParams) {
  const [actionLoading, setActionLoading] = useState(false);

  async function handleLoadOlderMessages() {
    if (!token || !selectedConversation?.messages.length) {
      return;
    }

    const cursor = selectedConversation.messages[0].id;

    await runConversationAction(async () => {
      const olderMessages = await apiClient.getConversationMessages(
        token,
        selectedConversation.id,
        cursor,
      );

      if (olderMessages.length > 0) {
        setSelectedConversation((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            messages: [...olderMessages, ...prev.messages],
          };
        });
      }
    });
  }

  async function handleUpdateReadStatus(isRead: boolean) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.updateConversationReadStatus(
        token,
        selectedConversation.id,
        isRead,
        selectedConversation.version,
      );
    });
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

  async function handleSendReply(
    content: string,
    replyToExternalId?: string | null,
  ) {
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
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.addConversationTag(token, selectedConversation.id, tagId);
    });
  }

  async function handleCreateTag(name: string, color?: string) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      const newTag = await apiClient.createTag(token, name, color);
      void loadTags(token);
      await apiClient.addConversationTag(
        token,
        selectedConversation.id,
        newTag.id,
      );
    });
  }

  async function handleRemoveTag(tagId: string) {
    if (!token || !selectedConversation) {
      return;
    }

    await runConversationAction(async () => {
      await apiClient.removeConversationTag(
        token,
        selectedConversation.id,
        tagId,
      );
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
  };
}
