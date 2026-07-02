"use client";

import { useEffect, useState } from "react";
import { REALTIME_EVENT_TYPES, type RealtimeEvent } from "@omnidesk/shared";
import { apiClient, ApiError } from "@/lib/api-client";
import { useRealtime } from "@/lib/use-realtime";
import type {
  ConversationDetail,
  ConversationFilters,
  ConversationListItem,
  ConversationStatus,
  CreateOutboundMessagePayload,
  CurrentUser,
  Priority,
} from "@/lib/api-types";
import {
  AppHeader,
  ConversationDetailPanel,
  ConversationList,
  ErrorBanner,
  InboxFilters,
  LoadingScreen,
  LoginScreen,
  SidePanel,
} from "@/features/inbox/inbox-components";

const TOKEN_STORAGE_KEY = "omnidesk.accessToken";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationDetail | null>(null);
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; email: string }[]>([]);
  const replyDisabledReason = selectedConversation
    ? getReplyDisabledReason(selectedConversation)
    : null;

  const { connectionState } = useRealtime({
    conversationId: selectedId,
    onEvents: handleRealtimeEvents,
    token,
  });
  const realtimeFallbackActive =
    connectionState === "disconnected" || connectionState === "error";

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!storedToken) {
      return;
    }

    apiClient
      .me(storedToken)
      .then((user) => {
        setToken(storedToken);
        setCurrentUser(user);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    void loadConversations(token, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleLogin(email: string, password: string) {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const data = await apiClient.login(email, password);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
      setToken(data.accessToken);
      setCurrentUser(data.user);
      void loadAgents(data.accessToken);
    } catch (caught) {
      setAuthError(getErrorMessage(caught));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setConversations([]);
    setSelectedId(null);
    setSelectedConversation(null);
  }

  async function loadAgents(accessToken: string) {
    try {
      const data = await apiClient.getAgents(accessToken);
      setAgents(data);
    } catch (caught) {
      console.error("Failed to load agents", caught);
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
      setError(getErrorMessage(caught));
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
      setError(getErrorMessage(caught));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRealtimeEvents(events: RealtimeEvent[]) {
    if (!token || events.length === 0) {
      return;
    }

    const shouldRefreshList = events.some(shouldRefreshConversationList);
    const shouldRefreshDetail =
      selectedId !== null &&
      events.some((event) => event.conversationId === selectedId);

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
      setError(getErrorMessage(caught));
    } finally {
      setActionLoading(false);
    }
  }

  if (authLoading && !currentUser) {
    return <LoadingScreen />;
  }

  if (!token || !currentUser) {
    return <LoginScreen error={authError} onLogin={handleLogin} />;
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-black p-4 text-neutral-200">
      <div className="flex h-full flex-col gap-4">
        <div className="shrink-0 rounded-xl overflow-hidden border border-[#333333]">
          <AppHeader
            apiBaseUrl={apiClient.baseUrl}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        </div>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)_320px]">
          <aside className="flex min-h-0 flex-col rounded-xl overflow-hidden border border-[#333333] bg-[#1f1f1f]">
            <InboxFilters
              filters={filters}
              loading={listLoading}
              onChange={setFilters}
              onRefresh={() => token && loadConversations(token, filters)}
              onSearch={handleSearchSubmit}
            />
            <ConversationList
              conversations={conversations}
              loading={listLoading}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </aside>

          <section className="relative flex min-h-0 flex-col rounded-xl overflow-hidden border border-[#333333] bg-[#1f1f1f]">
            {error ? <ErrorBanner message={error} /> : null}
            <ConversationDetailPanel
              conversation={selectedConversation}
              loading={detailLoading}
              onSendReply={handleSendReply}
              replyDisabledReason={replyDisabledReason}
            />
          </section>

          <aside className="flex min-h-0 flex-col overflow-y-auto rounded-xl overflow-hidden border border-[#333333] bg-[#1f1f1f]">
            <SidePanel
              actionLoading={actionLoading}
              agents={agents}
              conversation={selectedConversation}
              currentUser={currentUser}
              onAssignAgent={handleAssignAgent}
              onAssignToMe={handleAssignToMe}
              onPriorityChange={handlePriorityChange}
              onStatusChange={handleStatusChange}
            />
          </aside>
        </section>
      </div>
    </main>
  );
}

function shouldRefreshConversationList(event: RealtimeEvent) {
  return (
    event.type === REALTIME_EVENT_TYPES.CONVERSATION_CREATED ||
    event.type === REALTIME_EVENT_TYPES.CONVERSATION_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.MESSAGE_CREATED ||
    event.type === REALTIME_EVENT_TYPES.TICKET_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.OUTBOUND_MESSAGE_UPDATED ||
    event.type === REALTIME_EVENT_TYPES.SLA_OVERDUE
  );
}

function normalizeConversationDetail(
  conversation: ConversationDetail,
): ConversationDetail {
  return {
    ...conversation,
    messages: dedupeById(conversation.messages),
  };
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

function createOutboundMessagePayload(
  conversation: ConversationDetail,
  content: string,
  replyToExternalId?: string | null,
): CreateOutboundMessagePayload {
  const disabledReason = getReplyDisabledReason(conversation);

  if (disabledReason) {
    throw new Error(disabledReason);
  }

  if (conversation.channelType === "EMAIL") {
    return {
      conversationId: conversation.id,
      channelType: conversation.channelType,
      provider: "EMAIL",
      recipientExternalId: conversation.customer.email ?? undefined,
      content,
    };
  }

  if (conversation.channelType === "FACEBOOK_MESSAGE") {
    return {
      conversationId: conversation.id,
      channelType: conversation.channelType,
      provider: "FACEBOOK",
      recipientExternalId:
        conversation.customer.externalFacebookId ?? undefined,
      replyToMessageId: replyToExternalId ?? undefined,
      content,
    };
  }

  return {
    conversationId: conversation.id,
    channelType: conversation.channelType,
    provider: "FACEBOOK",
    recipientExternalId: conversation.customer.externalFacebookId ?? undefined,
    replyToMessageId: replyToExternalId ?? undefined,
    content,
  };
}

function getReplyDisabledReason(conversation: ConversationDetail) {
  if (conversation.channelType === "EMAIL" && !conversation.customer.email) {
    return "Customer email is missing.";
  }

  if (
    (conversation.channelType === "FACEBOOK_MESSAGE" ||
      conversation.channelType === "FACEBOOK_COMMENT") &&
    !conversation.customer.externalFacebookId
  ) {
    return "Customer Facebook id is missing.";
  }

  return null;
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof ApiError || caught instanceof Error) {
    return caught.message;
  }

  return "Unexpected error";
}
