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
  Search,
  Send,
  UserCheck,
} from "lucide-react";
import { FormEvent, useMemo, useState, useRef, useEffect } from "react";
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
    <header className="flex min-h-16 items-center justify-between gap-4 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Inbox size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold">OmniDesk Inbox</h1>
            <p className="text-xs text-slate-500">{apiBaseUrl}</p>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-4 border-l border-slate-200 pl-6 h-10">
          <a href="/" className="text-sm font-medium text-slate-900 hover:text-indigo-600">
            Inbox
          </a>
          <a href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-indigo-600">
            Dashboard
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{currentUser.name}</p>
          <p className="text-xs text-slate-500">{currentUser.role}</p>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100"
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
    <div className="border-b border-slate-200 p-4">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(search);
        }}
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
            aria-hidden="true"
          />
          <input
            className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-slate-950"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            value={search}
          />
        </div>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
      <span className="mb-1 block text-xs font-medium text-slate-500">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs outline-none cursor-pointer focus:border-slate-950"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
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
    <div className="flex-1 overflow-y-auto p-2">
      {conversations.map((conversation) => (
        <button
          className={`mb-2 w-full rounded-lg border p-3 text-left transition cursor-pointer ${
            selectedId === conversation.id
              ? "border-slate-950 bg-slate-100"
              : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {conversation.customer.name ??
                  conversation.customer.email ??
                  "Unknown customer"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {conversation.subject ?? "No subject"}
              </p>
            </div>
            <ChevronRight
              className="mt-1 shrink-0 text-slate-400"
              size={16}
              aria-hidden="true"
            />
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            <ChannelBadge channelType={conversation.channelType} />
            <StatusBadge status={conversation.status} />
            <PriorityBadge priority={conversation.priority} />
          </div>

          <p className="line-clamp-2 min-h-10 text-xs leading-5 text-slate-600">
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
}: {
  conversation: ConversationDetail | null;
  loading: boolean;
  onSendReply?: (content: string) => Promise<void>;
  replyDisabledReason?: string | null;
}) {
  const sortedMessages = useMemo(
    () => conversation?.messages ?? [],
    [conversation],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sortedMessages]);

  if (loading && !conversation) {
    return <PaneState text="Loading conversation" />;
  }

  if (!conversation) {
    return <PaneState text="Select a conversation" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 bg-white p-4 shrink-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChannelBadge channelType={conversation.channelType} />
          <StatusBadge status={conversation.status} />
          <PriorityBadge priority={conversation.priority} />
        </div>
        <h2 className="text-lg font-semibold">
          {conversation.subject ?? "Untitled conversation"}
        </h2>
        <p className="text-sm text-slate-500">
          {conversation.customer.name ??
            conversation.customer.email ??
            "Unknown customer"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {sortedMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>

      <ReplyComposer
        disabledReason={replyDisabledReason}
        onSendReply={onSendReply}
      />
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: ConversationDetail["messages"][number];
}) {
  const outbound = message.direction === "OUTBOUND";

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg border px-4 py-3 ${
          outbound
            ? "border-slate-950 bg-slate-950 text-white"
            : "border-slate-200 bg-white text-slate-950"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
          <span>{formatEnum(message.senderType)}</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6">
          {message.content}
        </p>
        <p className="mt-2 text-xs opacity-70">
          {formatEnum(message.deliveryStatus)}
        </p>
      </div>
    </div>
  );
}

function ReplyComposer({
  disabledReason,
  onSendReply,
}: {
  disabledReason?: string | null;
  onSendReply?: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
      className="border-t border-slate-200 bg-white p-4"
      onSubmit={handleSubmit}
    >
      <div className="flex gap-2">
        <textarea
          className="min-h-20 flex-1 resize-none rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-slate-950"
          disabled={submitting}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write a reply"
          value={content}
        />
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          disabled={disabled}
          title={disabledReason ?? "Send reply"}
          type="submit"
        >
          <Send size={17} aria-hidden="true" />
        </button>
      </div>
      {disabledReason ? (
        <p className="mt-2 text-xs text-slate-500">{disabledReason}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </form>
  );
}

export function SidePanel({
  actionLoading,
  agents = [],
  conversation,
  currentUser,
  onAssignAgent,
  onAssignToMe,
  onPriorityChange,
  onStatusChange,
}: {
  actionLoading: boolean;
  agents?: { id: string; name: string; email: string }[];
  conversation: ConversationDetail | null;
  currentUser: CurrentUser;
  onAssignAgent?: (agentId: string) => void;
  onAssignToMe: () => void;
  onPriorityChange: (priority: Priority) => void;
  onStatusChange: (status: ConversationStatus) => void;
}) {
  if (!conversation) {
    return <PaneState text="No ticket selected" />;
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <section className="border-b border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold">Customer</h3>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold">
            {getInitials(
              conversation.customer.name ?? conversation.customer.email,
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {conversation.customer.name ?? "Unknown customer"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {conversation.customer.email ??
                conversation.customer.externalFacebookId ??
                "No external id"}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold">Ticket</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Status
            </span>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none cursor-pointer focus:border-slate-950 disabled:cursor-not-allowed"
              disabled={actionLoading}
              onChange={(event) =>
                onStatusChange(event.target.value as ConversationStatus)
              }
              value={conversation.status}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatEnum(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Priority
            </span>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none cursor-pointer focus:border-slate-950 disabled:cursor-not-allowed"
              disabled={actionLoading}
              onChange={(event) =>
                onPriorityChange(event.target.value as Priority)
              }
              value={conversation.priority}
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {formatEnum(priority)}
                </option>
              ))}
            </select>
          </label>

          {conversation.assignedAgent ? (
            <div className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-50 border border-slate-200 text-sm font-medium text-slate-600">
              <UserCheck size={16} aria-hidden="true" className="text-emerald-500" />
              Assigned to {conversation.assignedAgent.name || "Agent"}
            </div>
          ) : currentUser.role === "ADMIN" ? (
            <div className="block pt-2">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Assign to Agent
              </span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none cursor-pointer focus:border-slate-950 disabled:cursor-not-allowed"
                disabled={actionLoading}
                onChange={(event) => {
                  if (event.target.value && onAssignAgent) {
                    onAssignAgent(event.target.value);
                  }
                }}
                value=""
              >
                <option value="" disabled>Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-medium cursor-pointer hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
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

      <section className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Tags</h3>
        <div className="flex flex-wrap gap-2">
          {conversation.tags.length > 0 ? (
            conversation.tags.map((tag) => (
              <span
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                key={tag.id}
              >
                {tag.name}
              </span>
            ))
          ) : (
            <p className="text-sm text-slate-500">No tags</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ChannelBadge({ channelType }: { channelType: ChannelType }) {
  const icon =
    channelType === "EMAIL" ? (
      <Mail size={13} aria-hidden="true" />
    ) : (
      <MessageCircle size={13} aria-hidden="true" />
    );

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
      {icon}
      {channelOptions.find((option) => option.value === channelType)?.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
      {formatEnum(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const className =
    priority === "URGENT" || priority === "HIGH"
      ? "bg-rose-50 text-rose-700"
      : priority === "MEDIUM"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${className}`}
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
