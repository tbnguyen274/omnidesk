"use client";

import {
  AlertCircle,
  Check,
  ChevronRight,
  Inbox,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  Reply,
  Search,
  Send,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState, useEffect, useRef, useLayoutEffect } from "react";
import type {
  ChannelType,
  ConversationDetail,
  ConversationFilters,
  ConversationListItem,
  ConversationStatus,
  CurrentUser,
  Priority,
} from "@/lib/api-types";

const channelOptions: Array<{ value: ChannelType; label: string }> = [
  { value: "FACEBOOK_MESSAGE", label: "Messenger" },
  { value: "FACEBOOK_COMMENT", label: "Comment" },
  { value: "EMAIL", label: "Email" },
];

const statusOptions: ConversationStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
];

const priorityOptions: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function LoginScreen({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("agent@omnidesk.local");
  const [password, setPassword] = useState("password");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email, password);
    setSubmitting(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-4 text-slate-950">
      <form
        className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Inbox size={22} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">OmniDesk</h1>
            <p className="text-sm text-slate-500">Agent workspace</p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="mb-4 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />

        <label className="mb-2 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="mb-4 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          id="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />

        {error ? <ErrorBanner message={error} /> : null}

        <button
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={submitting}
          type="submit"
        >
          <Check size={17} aria-hidden="true" />
          Sign in
        </button>
      </form>
    </main>
  );
}

export function AppHeader({
  apiBaseUrl,
  currentUser,
  onLogout,
}: {
  apiBaseUrl: string;
  currentUser: CurrentUser;
  onLogout: () => void;
}) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 bg-[#1f1f1f] border-b border-[#333333] px-4 sm:px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Inbox size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">OmniDesk Inbox</h1>
            <p className="text-xs text-neutral-400">{apiBaseUrl}</p>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-4 border-l border-[#333333] pl-6 h-10">
          <Link href="/" className="text-sm font-medium text-neutral-300 hover:text-white transition-colors">
            Inbox
          </Link>
          <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-white transition-colors">
            Dashboard
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-white">{currentUser.name}</p>
          <p className="text-xs text-neutral-400">{currentUser.role}</p>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[#333333] text-neutral-400 cursor-pointer hover:bg-[#2a2a2a] hover:text-white transition-colors"
          onClick={onLogout}
          title="Logout"
          type="button"
        >
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function InboxFilters({
  filters,
  loading,
  onChange,
  onRefresh,
  onSearch,
}: {
  filters: ConversationFilters;
  loading: boolean;
  onChange: (filters: ConversationFilters) => void;
  onRefresh: () => void;
  onSearch: (search: string) => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");

  return (
    <div className="border-b border-[#333333] bg-[#1f1f1f] p-4">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(search);
        }}
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            size={16}
            aria-hidden="true"
          />
          <input
            className="h-10 w-full rounded-md border border-[#333333] bg-[#141414] pl-9 pr-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-[#555555] transition-colors"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            value={search}
          />
        </div>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[#333333] bg-[#141414] text-neutral-400 cursor-pointer hover:bg-[#2a2a2a] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={loading}
          title="Refresh inbox"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </form>

      <div className="grid grid-cols-3 gap-2">
        <FilterSelect
          label="Channel"
          value={filters.channelType ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              channelType: (value || undefined) as ChannelType | undefined,
            })
          }
          options={channelOptions}
        />
        <FilterSelect
          label="Status"
          value={filters.status ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              status: (value || undefined) as ConversationStatus | undefined,
            })
          }
          options={statusOptions.map((status) => ({
            value: status,
            label: formatEnum(status),
          }))}
        />
        <FilterSelect
          label="Priority"
          value={filters.priority ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              priority: (value || undefined) as Priority | undefined,
            })
          }
          options={priorityOptions.map((priority) => ({
            value: priority,
            label: formatEnum(priority),
          }))}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-400">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-md border border-[#333333] bg-[#141414] px-2 text-xs text-neutral-200 outline-none cursor-pointer focus:border-[#555555] transition-colors"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="" className="bg-[#1f1f1f]">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#1f1f1f]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
}: {
  conversations: ConversationListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading && conversations.length === 0) {
    return <PaneState text="Loading inbox" />;
  }

  if (conversations.length === 0) {
    return <PaneState text="No conversations found" />;
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 bg-transparent">
      {conversations.map((conversation) => (
        <button
          className={`mb-2 w-full rounded-lg border p-3 text-left transition-colors cursor-pointer ${selectedId === conversation.id
              ? "border-[#444444] bg-[#2a2a2a]"
              : "border-[#333333] bg-transparent hover:bg-[#2a2a2a]/50"
            }`}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {conversation.customer.name ??
                  conversation.customer.email ??
                  "Unknown customer"}
              </p>
              <p className="truncate text-xs text-neutral-400">
                {conversation.subject ?? "No subject"}
              </p>
            </div>
            <ChevronRight
              className="mt-1 shrink-0 text-neutral-500"
              size={16}
              aria-hidden="true"
            />
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            <ChannelBadge channelType={conversation.channelType} />
            <StatusBadge status={conversation.status} />
            <PriorityBadge priority={conversation.priority} />
          </div>

          <p className="line-clamp-2 min-h-10 text-xs leading-5 text-neutral-400">
            {conversation.lastMessage?.content ?? "No messages yet"}
          </p>
        </button>
      ))}
    </div>
  );
}

export function ConversationDetailPanel({
  conversation,
  loading,
  onSendReply,
  replyDisabledReason,
  typingAgents,
  onTypingChange,
  onLoadOlderMessages,
}: {
  conversation: ConversationDetail | null;
  loading: boolean;
  onSendReply?: (content: string, replyToExternalId?: string | null) => Promise<void>;
  replyDisabledReason?: string | null;
  typingAgents?: string[];
  onTypingChange?: (isTyping: boolean) => void;
  onLoadOlderMessages?: () => Promise<void>;
}) {
  const sortedMessages = useMemo(
    () => conversation?.messages ?? [],
    [conversation],
  );

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScrollHeightRef = useRef<number>(0);

  const [replyingToMessage, setReplyingToMessage] = useState<
    ConversationDetail["messages"][number] | null
  >(null);

  const isAdjustingScrollRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplyingToMessage(null);
  }, [conversation?.id]);

  useLayoutEffect(() => {
    if (scrollRef.current) {
      if (isAdjustingScrollRef.current) {
        // Adjust scroll position after loading older messages so the view doesn't jump
        const newScrollHeight = scrollRef.current.scrollHeight;
        scrollRef.current.scrollTop = newScrollHeight - previousScrollHeightRef.current;
        isAdjustingScrollRef.current = false;
      } else if (
        scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 100
      ) {
        // Only auto-scroll to bottom if the user was already near the bottom
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [sortedMessages]);

  const handleScroll = async () => {
    if (!scrollRef.current || !onLoadOlderMessages || isLoadingOlder || !hasMoreMessages) return;

    if (scrollRef.current.scrollTop === 0) {
      const prevMessageCount = sortedMessages.length;
      previousScrollHeightRef.current = scrollRef.current.scrollHeight;
      isAdjustingScrollRef.current = true;
      setIsLoadingOlder(true);
      
      await onLoadOlderMessages();
      
      // If we didn't get any new messages, we've reached the end
      if (conversation?.messages && conversation.messages.length === prevMessageCount) {
        setHasMoreMessages(false);
      }
      setIsLoadingOlder(false); // Reset loading state
    }
  };

  if (loading && !conversation) {
    return <PaneState text="Loading conversation" />;
  }

  if (!conversation) {
    return <PaneState text="Select a conversation" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="border-b border-[#333333] p-4 shrink-0 bg-transparent">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChannelBadge channelType={conversation.channelType} />
          <StatusBadge status={conversation.status} />
          <PriorityBadge priority={conversation.priority} />
        </div>
        <h2 className="text-lg font-semibold text-white">
          {conversation.subject ?? "Untitled conversation"}
        </h2>
        <p className="text-sm text-neutral-400">
          {conversation.customer.name ??
            conversation.customer.email ??
            "Unknown customer"}
        </p>
        {typingAgents && typingAgents.length > 0 && (
          <p className="text-xs text-amber-500 mt-1">
            {typingAgents.join(", ")} {typingAgents.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#141414]" ref={scrollRef} onScroll={handleScroll}>
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {isLoadingOlder && (
            <div className="text-center py-2">
              <span className="text-xs text-neutral-500">Loading older messages...</span>
            </div>
          )}
          {sortedMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              repliedToMessage={
                message.replyToMessageId
                  ? sortedMessages.find(
                    (m) => m.externalMessageId === message.replyToMessageId,
                  )
                  : undefined
              }
              showReplyButton={
                (conversation.channelType === "FACEBOOK_COMMENT" ||
                  conversation.channelType === "FACEBOOK_MESSAGE") &&
                message.direction === "INBOUND"
              }
              onReply={() => setReplyingToMessage(message)}
            />
          ))}
        </div>
      </div>

      <ReplyComposer
        disabledReason={replyDisabledReason}
        onSendReply={async (content) => {
          await onSendReply?.(content, replyingToMessage?.externalMessageId);
          setReplyingToMessage(null);
        }}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(null)}
        onTypingChange={onTypingChange}
      />
    </div>
  );
}

function MessageBubble({
  message,
  repliedToMessage,
  showReplyButton,
  onReply,
}: {
  message: ConversationDetail["messages"][number];
  repliedToMessage?: ConversationDetail["messages"][number];
  showReplyButton?: boolean;
  onReply?: () => void;
}) {
  const outbound = message.direction === "OUTBOUND";

  return (
    <div className={`group flex ${outbound ? "justify-end" : "justify-start"} items-center gap-2`}>
      <div
        className={`${message.contentType === "HTML" ? "max-w-[95%] w-full" : "max-w-[78%]"} rounded-lg border px-4 py-3 relative ${outbound
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-[#444444] bg-[#2a2a2a] text-neutral-100"
          }`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
          <span>{formatEnum(message.senderType)}</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {repliedToMessage && (
          <div className={`mb-2 flex items-center gap-2 border-l-2 pl-2 text-xs opacity-70 ${outbound ? "border-white" : "border-neutral-500"}`}>
            <span className="truncate">{repliedToMessage.content}</span>
          </div>
        )}
        {message.contentType === "HTML" ? (
          <HtmlMessageViewer html={message.content} />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6 break-words">
            {linkify(message.content)}
          </p>
        )}
        <p className="mt-2 text-xs opacity-70">
          {formatEnum(message.deliveryStatus)}
        </p>
      </div>
      {showReplyButton && !outbound && (
        <button
          className="invisible group-hover:visible p-1.5 rounded-full text-neutral-500 hover:text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
          title="Reply to this comment"
          onClick={onReply}
        >
          <Reply size={16} />
        </button>
      )}
    </div>
  );
}

export function ReplyComposer({
  disabledReason,
  onSendReply,
  replyingToMessage,
  onCancelReply,
  onTypingChange,
}: {
  disabledReason?: string | null;
  onSendReply?: (content: string) => Promise<void>;
  replyingToMessage?: ConversationDetail["messages"][number] | null;
  onCancelReply?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  
  useEffect(() => {
    onTypingChange?.(content.length > 0);
  }, [content, onTypingChange]);

  const trimmedContent = content.trim();
  const disabled =
    submitting || !onSendReply || Boolean(disabledReason) || !trimmedContent;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || !onSendReply) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await onSendReply(trimmedContent);
      setContent("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      className="border-t border-[#333333] bg-transparent p-4 shrink-0"
      onSubmit={handleSubmit}
    >
      {replyingToMessage && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-[#141414] border border-[#333333] p-2 text-xs text-neutral-300">
          <div className="flex items-center gap-2 truncate">
            <Reply size={14} className="text-neutral-500" />
            <span className="font-semibold text-white">
              Replying to:
            </span>
            <span className="truncate opacity-80">
              {replyingToMessage.content}
            </span>
          </div>
          {onCancelReply && (
            <button
              type="button"
              className="p-1 hover:bg-[#2a2a2a] rounded-md cursor-pointer transition-colors"
              onClick={onCancelReply}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          className="min-h-20 flex-1 resize-none rounded-md border border-[#333333] bg-[#141414] p-3 text-sm text-neutral-200 outline-none focus:border-[#555555] placeholder:text-neutral-500 transition-colors"
          disabled={submitting}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="Write a reply (Enter to send, Shift+Enter for new line)"
          value={content}
        />
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-700 text-white cursor-pointer disabled:cursor-not-allowed disabled:bg-[#2a2a2a] disabled:text-neutral-600 hover:bg-[#555555] transition-colors"
          disabled={disabled}
          title={disabledReason ?? "Send reply"}
          type="submit"
        >
          <Send size={17} aria-hidden="true" />
        </button>
      </div>
      {disabledReason ? (
        <p className="mt-2 text-xs text-neutral-500">{disabledReason}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-500">{error}</p> : null}
    </form>
  );
}

function TagsSection({
  actionLoading,
  tags = [],
  conversationTags = [],
  onAddTag,
  onCreateTag,
  onRemoveTag,
}: {
  actionLoading: boolean;
  tags?: { id: string; name: string; color?: string | null }[];
  conversationTags: { id: string; name: string; color?: string | null }[];
  onAddTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color?: string) => void;
  onRemoveTag?: (tagId: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      const name = inputValue.trim().toLowerCase();
      const existing = tags.find((t) => t.name.toLowerCase() === name);
      if (existing) {
        onAddTag?.(existing.id);
      } else {
        onCreateTag?.(name);
      }
      setInputValue("");
      setIsAdding(false);
    } else if (e.key === "Escape") {
      setInputValue("");
      setIsAdding(false);
    }
  };

  const filteredTags = tags.filter(
    (t) =>
      t.name.toLowerCase().includes(inputValue.trim().toLowerCase()) &&
      !conversationTags.find((ct) => ct.id === t.id)
  );

  const exactMatch = tags.some((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <section className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Tags</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {conversationTags.map((tag) => (
          <span
            className="group flex items-center gap-1 rounded-md border border-[#444444] bg-[#2a2a2a] pl-2 pr-1 py-1 text-xs text-neutral-300"
            key={tag.id}
          >
            {tag.name}
            <button
              onClick={() => onRemoveTag?.(tag.id)}
              disabled={actionLoading}
              className="text-neutral-500 hover:text-red-400 focus:outline-none disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove tag"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {conversationTags.length === 0 && !isAdding && (
          <p className="text-sm text-neutral-500">No tags</p>
        )}
        
        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            disabled={actionLoading}
            className="flex items-center gap-1 rounded-md bg-transparent border border-dashed border-[#555] px-2 py-1 text-xs font-medium text-neutral-400 hover:text-white hover:border-neutral-400 hover:bg-[#2a2a2a] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add tag
          </button>
        ) : (
          <div className="relative">
            <input
              autoFocus
              type="text"
              placeholder="Tag name..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // slight delay to allow click on options
                setTimeout(() => {
                  if (!inputValue.trim()) {
                    setIsAdding(false);
                  }
                }, 150);
              }}
              disabled={actionLoading}
              className="w-32 rounded-md border border-[#555] bg-[#141414] px-2 py-1 text-xs text-white outline-none focus:border-indigo-500 disabled:cursor-not-allowed transition-colors"
            />
            {inputValue.trim() && (
              <div className="absolute top-full left-0 z-10 w-48 mt-1 max-h-40 overflow-y-auto rounded-md border border-[#333333] bg-[#1a1a1a] shadow-lg">
                {filteredTags.map((t) => (
                  <button
                    key={t.id}
                    className="block w-full text-left px-2 py-1.5 text-xs text-neutral-300 hover:bg-[#333333]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAddTag?.(t.id);
                      setInputValue("");
                      setIsAdding(false);
                    }}
                  >
                    {t.name}
                  </button>
                ))}
                {!exactMatch && (
                  <button
                    className="block w-full text-left px-2 py-1.5 text-xs text-indigo-300 hover:bg-[#333333]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onCreateTag?.(inputValue.trim().toLowerCase());
                      setInputValue("");
                      setIsAdding(false);
                    }}
                  >
                    Create &quot;{inputValue.trim().toLowerCase()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function SidePanel({
  actionLoading,
  agents = [],
  conversation,
  currentUser,
  tags = [],
  onAssignAgent,
  onAssignToMe,
  onUnassign,
  onPriorityChange,
  onStatusChange,
  onAddTag,
  onCreateTag,
  onRemoveTag,
}: {
  actionLoading: boolean;
  agents?: { id: string; name: string; email: string }[];
  conversation: ConversationDetail | null;
  currentUser: CurrentUser;
  tags?: { id: string; name: string; color?: string | null }[];
  onAssignAgent?: (agentId: string) => void;
  onAssignToMe: () => void;
  onUnassign?: () => void;
  onPriorityChange: (priority: Priority) => void;
  onStatusChange: (status: ConversationStatus) => void;
  onAddTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color?: string) => void;
  onRemoveTag?: (tagId: string) => void;
}) {
  if (!conversation) {
    return <PaneState text="No ticket selected" />;
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col bg-transparent text-neutral-300 border-l border-[#333333]">
      <section className="border-b border-[#333333] p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Customer Information</h3>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#2a2a2a] border border-[#444444] text-sm font-semibold text-white">
            {getInitials(
              conversation.customer.name ?? conversation.customer.email,
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {conversation.customer.name ?? "Unknown customer"}
            </p>
            <p className="truncate text-xs text-neutral-400">
              {conversation.customer.email ??
                conversation.customer.externalFacebookId ??
                "No external id"}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#333333] p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Ticket Details</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              Status
            </span>
            <select
              className="h-10 w-full rounded-md border border-[#333333] bg-[#141414] px-2 text-sm outline-none cursor-pointer focus:border-[#555555] disabled:cursor-not-allowed transition-colors"
              disabled={actionLoading}
              onChange={(event) =>
                onStatusChange(event.target.value as ConversationStatus)
              }
              value={conversation.status}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status} className="bg-[#1f1f1f]">
                  {formatEnum(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              Priority
            </span>
            <select
              className="h-10 w-full rounded-md border border-[#333333] bg-[#141414] px-2 text-sm outline-none cursor-pointer focus:border-[#555555] disabled:cursor-not-allowed transition-colors"
              disabled={actionLoading}
              onChange={(event) =>
                onPriorityChange(event.target.value as Priority)
              }
              value={conversation.priority}
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority} className="bg-[#1f1f1f]">
                  {formatEnum(priority)}
                </option>
              ))}
            </select>
          </label>

          {conversation.assignedAgent ? (
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#2a2a2a] border border-[#444444] text-sm font-medium text-neutral-300">
                <UserCheck size={16} aria-hidden="true" className="text-emerald-500" />
                Assigned to {conversation.assignedAgent.name || "Agent"}
              </div>
              {(currentUser.role === "ADMIN" || currentUser.id === conversation.assignedAgent.id) && onUnassign && (
                <button
                  className="flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-red-600 text-xs font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={actionLoading}
                  onClick={onUnassign}
                  type="button"
                >
                  Unassign
                </button>
              )}
            </div>
          ) : currentUser.role === "ADMIN" ? (
            <div className="block pt-2">
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                Assign to Agent
              </span>
              <select
                className="h-10 w-full rounded-md border border-[#333333] bg-[#141414] px-2 text-sm outline-none cursor-pointer focus:border-[#555555] disabled:cursor-not-allowed transition-colors"
                disabled={actionLoading}
                onChange={(event) => {
                  if (event.target.value && onAssignAgent) {
                    onAssignAgent(event.target.value);
                  }
                }}
                value=""
              >
                <option value="" disabled className="bg-[#1f1f1f]">Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-[#1f1f1f]">
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#444444] bg-[#2a2a2a] text-sm font-medium cursor-pointer hover:bg-[#333333] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={actionLoading}
              onClick={onAssignToMe}
              type="button"
            >
              <UserCheck size={16} aria-hidden="true" />
              Assign to me
            </button>
          )}
        </div>
      </section>

      <TagsSection
        actionLoading={actionLoading}
        tags={tags}
        conversationTags={conversation.tags}
        onAddTag={onAddTag}
        onCreateTag={onCreateTag}
        onRemoveTag={onRemoveTag}
      />
    </div>
  );
}

function ChannelBadge({ channelType }: { channelType: ChannelType }) {
  const isEmail = channelType === "EMAIL";
  const icon = isEmail ? (
    <Mail size={13} aria-hidden="true" />
  ) : (
    <MessageCircle size={13} aria-hidden="true" />
  );

  const colors = isEmail
    ? "bg-fuchsia-600 text-white border-fuchsia-600"
    : "bg-indigo-600 text-white border-indigo-600";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] leading-none font-medium border ${colors}`}>
      {icon}
      {channelOptions.find((option) => option.value === channelType)?.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  const colors = {
    NEW: "bg-violet-600 text-white border-violet-600",
    IN_PROGRESS: "bg-blue-600 text-white border-blue-600",
    WAITING_CUSTOMER: "bg-amber-600 text-white border-amber-600",
    RESOLVED: "bg-emerald-600 text-white border-emerald-600",
    CLOSED: "bg-neutral-700 text-neutral-300 border-neutral-700",
  }[status] || "bg-neutral-700 text-neutral-300 border-neutral-700";

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] leading-none font-medium border ${colors}`}>
      {formatEnum(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const className =
    priority === "URGENT"
      ? "bg-rose-600 text-white border-rose-600"
      : priority === "HIGH"
        ? "bg-orange-600 text-white border-orange-600"
        : priority === "MEDIUM"
          ? "bg-sky-600 text-white border-sky-600"
          : "bg-neutral-600 text-white border-neutral-600";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] leading-none font-medium border ${className}`}
    >
      {formatEnum(priority)}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="m-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] text-sm text-slate-600">
      Loading OmniDesk
    </main>
  );
}

function PaneState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInitials(value: string | null) {
  if (!value) {
    return "NA";
  }

  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return "Unable to send reply";
}

function HtmlMessageViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustHeight = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        const height = iframeRef.current.contentWindow.document.documentElement.scrollHeight;
        iframeRef.current.style.height = `${Math.max(height, 60)}px`;
      } catch {
        // Ignore cross-origin errors if any
      }
    }
  };

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      onLoad={adjustHeight}
      className="w-full border-none bg-white rounded-md text-slate-950"
      style={{ minWidth: "100%", minHeight: "60px" }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-blue-500"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
