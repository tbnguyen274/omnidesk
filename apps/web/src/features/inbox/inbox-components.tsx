"use client";

import {
  AlertCircle,
  Check,
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
  Eye,
  EyeOff,
  Paperclip,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState, useEffect, useRef, useLayoutEffect } from "react";
import { apiClient } from "@/lib/api-client";
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [forgotError, setForgotError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email, password);
    setSubmitting(false);
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotStatus("loading");
    setForgotError("");

    try {
      await apiClient.forgotPassword(forgotEmail);
      setForgotStatus("success");
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "An error occurred");
      setForgotStatus("error");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#F8F9FB] overflow-hidden p-4 font-sans">
      {/* Dynamic Background Elements - Wavy lines and blurry blob */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden flex items-center justify-center">
        {/* Blurry red blob behind the form */}
        <div className="absolute h-[600px] w-[600px] rounded-full bg-[#EE0033]/10 blur-[100px]" />
        
        {/* SVG curved lines matching the reference */}
        <svg className="absolute w-[150vw] h-[150vh] min-w-[1440px] opacity-70" preserveAspectRatio="none" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-200 600 C 300 200, 800 800, 1600 300" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.6" fill="none" />
          <path d="M-200 650 C 400 300, 900 700, 1600 200" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
          <path d="M-200 700 C 500 400, 1000 600, 1600 100" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.2" fill="none" />
          
          <path d="M-200 300 C 400 -50, 900 1100, 1600 800" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.5" fill="none" />
          <path d="M-200 350 C 500 0, 1000 1000, 1600 700" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.3" fill="none" />
        </svg>
      </div>
      
      <div className="relative z-10 w-full max-w-[440px]">
        <form
          className="rounded-[32px] border border-white/80 bg-white/60 backdrop-blur-2xl p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] transition-all"
          onSubmit={handleSubmit}
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EE0033] text-white shadow-lg shadow-[#EE0033]/30">
              <Inbox size={32} strokeWidth={2.5} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">OmniDesk</h1>
              <p className="text-sm text-slate-500 font-medium mt-1">Enterprise Agent Login</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="email">
                Email Address
              </label>
              <input
                className="h-12 w-full rounded-xl border border-[#EE0033] bg-slate-50/80 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="agent@omnidesk.local"
                value={email}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-xl border border-[#EE0033] bg-slate-50/80 pl-4 pr-11 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 flex h-12 w-12 cursor-pointer items-center justify-center text-[#EE0033] hover:text-[#c4002a] focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm font-medium text-red-600">
              {error}
            </div>
          ) : null}

          <button
            className="mt-8 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#EE0033] text-sm font-bold text-white transition-all hover:bg-[#d6002e] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100 shadow-md shadow-[#EE0033]/20"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Sign in to Workspace
              </>
            )}
          </button>

          <div className="mt-5 text-center">
            <button
              type="button"
              className="text-sm font-semibold text-[#EE0033] hover:underline"
              onClick={() => setForgotPasswordModalOpen(true)}
            >
              Forgot Password?
            </button>
          </div>
        </form>

      </div>

      {/* Forgot Password Modal */}
      {forgotPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Reset Password</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setForgotPasswordModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {forgotStatus === "success" ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={24} />
                </div>
                <h3 className="mb-2 text-lg font-medium text-slate-900">Check your email</h3>
                <p className="text-sm text-slate-500">
                  We sent a password reset link to <span className="font-medium text-slate-800">{forgotEmail}</span>
                </p>
                <button
                  type="button"
                  className="mt-6 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => setForgotPasswordModalOpen(false)}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <p className="mb-4 text-sm text-slate-500">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="forgot-email">
                    Email Address
                  </label>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033]"
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>

                {forgotStatus === "error" && (
                  <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-100">
                    {forgotError}
                  </div>
                )}

                <button
                  className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#EE0033] text-sm font-bold text-white shadow-md shadow-[#EE0033]/20 hover:bg-[#c4002a] hover:shadow-lg hover:shadow-[#EE0033]/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={forgotStatus === "loading" || !forgotEmail}
                >
                  {forgotStatus === "loading" ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
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
    <header className="flex min-h-16 items-center justify-between gap-4 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 shadow-sm z-10 relative">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EE0033] text-white shadow-md shadow-[#EE0033]/20">
            <Inbox size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">OmniDesk Inbox</h1>
            <p className="text-xs font-medium text-slate-500">{apiBaseUrl}</p>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-4 border-l border-slate-200 pl-6 h-10">
          <Link href="/" className="text-sm font-semibold text-slate-900 hover:text-[#EE0033] transition-colors">
            Inbox
          </Link>
          <Link href="/dashboard" className="text-sm font-medium text-slate-500 hover:text-[#EE0033] transition-colors">
            Dashboard
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-bold text-slate-900">{currentUser.name}</p>
          <p className="text-xs font-medium text-slate-500">{currentUser.role}</p>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-[#EE0033] hover:border-[#EE0033]/30 transition-colors bg-white shadow-sm"
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
    <div className="border-b border-slate-200 bg-white p-4">
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
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] transition-all shadow-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            value={search}
          />
        </div>
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-[#EE0033] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
      <span className="mb-1 block text-xs font-semibold text-slate-700">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 outline-none cursor-pointer focus:border-[#EE0033] focus:bg-white focus:ring-1 focus:ring-[#EE0033] transition-colors shadow-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="" className="bg-white text-slate-700">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-700">
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
    <div className="flex-1 overflow-y-auto p-3 bg-[#F8F9FB] flex flex-col gap-2">
      {conversations.map((conversation) => (
        <button
          className={`relative w-full border-l-[3px] p-4 text-left transition-all cursor-pointer ${
            selectedId === conversation.id
              ? "border-l-[#EE0033] bg-white shadow-sm ring-1 ring-slate-100/50"
              : "border-l-transparent bg-white hover:border-l-slate-300 hover:bg-slate-50 border border-slate-100"
          } rounded-r-xl rounded-l-md`}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="truncate text-sm font-bold text-slate-900 flex items-center gap-2">
                  {conversation.isRead === false && (
                    <span className="h-2 w-2 rounded-full bg-[#EE0033] shrink-0" />
                  )}
                  {conversation.customer.name ??
                    conversation.customer.email ??
                    "Unknown customer"}
                </p>
              </div>
              <p className="truncate text-sm font-medium text-slate-500 mb-2.5">
                {conversation.subject ?? "No subject"}
              </p>
              <div className="flex items-center gap-1.5 mb-2.5 overflow-hidden">
                <ChannelBadge channelType={conversation.channelType} />
                <StatusBadge status={conversation.status} />
                <PriorityBadge priority={conversation.priority} />
              </div>
              <p className={`line-clamp-2 min-h-[2.5rem] text-xs leading-5 ${selectedId === conversation.id ? "text-slate-600" : "text-slate-500"}`}>
                {conversation.lastMessage?.content ?? "No messages yet"}
              </p>
            </div>
          </div>
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
  onReadStatusChange,
}: {
  conversation: ConversationDetail | null;
  loading: boolean;
  onSendReply?: (content: string, replyToExternalId?: string | null) => Promise<void>;
  replyDisabledReason?: string | null;
  typingAgents?: string[];
  onTypingChange?: (isTyping: boolean) => void;
  onLoadOlderMessages?: () => Promise<void>;
  onReadStatusChange?: (isRead: boolean) => Promise<void>;
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

  const isInitialLoadRef = useRef(true);
  const currentConversationIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (conversation?.id !== currentConversationIdRef.current) {
      isInitialLoadRef.current = true;
      currentConversationIdRef.current = conversation?.id ?? null;
      setHasMoreMessages(true);
    }
  }, [conversation?.id]);

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
        isInitialLoadRef.current ||
        scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 100
      ) {
        // Only auto-scroll to bottom if the user was already near the bottom OR it's the initial load
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        // If we successfully scrolled and have messages, we can mark initial load as done
        if (sortedMessages.length > 0) {
          isInitialLoadRef.current = false;
        }
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
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-3 shrink-0 bg-white flex justify-between items-start z-10 shadow-sm relative">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 mb-1.5 truncate max-w-2xl">
            {conversation.subject ?? "Untitled conversation"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channelType={conversation.channelType} />
            <StatusBadge status={conversation.status} />
            <PriorityBadge priority={conversation.priority} />
          </div>
          {typingAgents && typingAgents.length > 0 && (
            <p className="text-xs text-[#EE0033] font-medium mt-2 animate-pulse">
              {typingAgents.join(", ")} {typingAgents.length === 1 ? 'is' : 'are'} typing...
            </p>
          )}
        </div>
        {onReadStatusChange && (
          <button
            onClick={() => onReadStatusChange(!conversation.isRead)}
            className={`rounded-[8px] px-3 py-1.5 text-xs font-bold shadow-sm cursor-pointer transition-colors ${
              conversation.isRead 
                ? "bg-[#EE0033] text-white hover:bg-[#CC002B]" 
                : "border border-slate-200 bg-white text-slate-600 hover:border-[#EE0033] hover:text-[#EE0033] hover:bg-red-50"
            }`}
          >
            {conversation.isRead ? "Mark unread" : "Mark read"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#F8F9FB]" ref={scrollRef} onScroll={handleScroll}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {isLoadingOlder && (
            <div className="text-center py-3">
              <span className="text-xs font-semibold text-slate-500 bg-slate-200/50 rounded-full px-3 py-1">Loading older messages...</span>
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
        className={`${message.contentType === "HTML" ? "max-w-[95%] w-full" : "max-w-[85%]"} rounded-2xl border px-4 py-3 relative shadow-sm ${outbound
            ? "border-[#EE0033] bg-[#EE0033] text-white rounded-br-sm"
            : "border-slate-200 bg-white text-slate-800 rounded-bl-sm"
          }`}
      >
        <div className={`mb-1.5 flex items-center gap-2 text-[11px] font-semibold ${outbound ? "text-white/80" : "text-slate-500"}`}>
          <span>{formatEnum(message.senderType)}</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {repliedToMessage && (
          <div className={`mb-2 flex items-center gap-2 border-l-[3px] pl-2 text-xs font-medium ${outbound ? "border-white/40 text-white/90" : "border-slate-300 text-slate-600"}`}>
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
        <p className={`mt-2 text-[10px] font-medium ${outbound ? "text-white/70" : "text-slate-400"}`}>
          {formatEnum(message.deliveryStatus)}
        </p>
      </div>
      {showReplyButton && !outbound && (
        <button
          className="invisible group-hover:visible p-1.5 rounded-full text-slate-400 hover:text-[#EE0033] hover:bg-red-50 transition-colors cursor-pointer"
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onTypingChange?.(content.length > 0);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
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
      className="border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10"
      onSubmit={handleSubmit}
    >
      {replyingToMessage && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 truncate">
            <Reply size={14} className="text-slate-400" />
            <span className="font-semibold text-slate-800">
              Replying to:
            </span>
            <span className="truncate font-medium">
              {replyingToMessage.content}
            </span>
          </div>
          {onCancelReply && (
            <button
              type="button"
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
              onClick={onCancelReply}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2 items-center">
        <button
          type="button"
          className="flex shrink-0 items-center justify-center h-10 w-10 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="Attach file"
        >
          <Paperclip size={20} />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          className="min-h-[42px] max-h-[120px] py-2.5 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] placeholder:text-slate-400 transition-all shadow-sm"
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
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#EE0033] text-white cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 hover:bg-[#d6002e] shadow-md shadow-[#EE0033]/20 transition-all active:scale-95"
          disabled={disabled}
          title={disabledReason ?? "Send reply"}
          type="submit"
        >
          <Send size={18} aria-hidden="true" className="ml-0.5" />
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
        <h3 className="text-sm font-bold text-slate-900">Tags</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {conversationTags.map((tag) => (
          <span
            className="group flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 pl-2 pr-1 py-1 text-xs font-semibold text-slate-700"
            key={tag.id}
          >
            {tag.name}
            <button
              onClick={() => onRemoveTag?.(tag.id)}
              disabled={actionLoading}
              className="text-slate-400 hover:text-[#EE0033] focus:outline-none disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove tag"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {conversationTags.length === 0 && !isAdding && (
          <p className="text-xs font-medium text-slate-400">No tags</p>
        )}
        
        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            disabled={actionLoading}
            className="flex items-center gap-1 rounded-md bg-transparent border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#EE0033] hover:border-[#EE0033] hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] disabled:cursor-not-allowed transition-colors"
            />
            {inputValue.trim() && (
              <div className="absolute top-full left-0 z-10 w-48 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {filteredTags.map((t) => (
                  <button
                    key={t.id}
                    className="block w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
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
                    className="block w-full text-left px-3 py-2 text-xs font-semibold text-[#EE0033] hover:bg-red-50 transition-colors"
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
    <div className="flex h-full min-h-[560px] flex-col bg-white text-slate-800 border-l border-slate-200 shadow-sm z-10">
      <section className="border-b border-slate-200 p-4">
        <h3 className="mb-3 text-xs uppercase tracking-wider font-bold text-slate-500">Customer Information</h3>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-sm font-bold text-slate-700 shadow-sm">
            {getInitials(
              conversation.customer.name ?? conversation.customer.email,
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {conversation.customer.name ?? "Unknown customer"}
            </p>
            <p className="truncate text-xs font-medium text-slate-500">
              {conversation.customer.email ??
                conversation.customer.externalFacebookId ??
                "No external id"}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 p-4">
        <h3 className="mb-3 text-xs uppercase tracking-wider font-bold text-slate-500">Ticket Details</h3>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">
              Status
            </span>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none cursor-pointer focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] disabled:cursor-not-allowed transition-colors shadow-sm"
              disabled={actionLoading}
              onChange={(event) =>
                onStatusChange(event.target.value as ConversationStatus)
              }
              value={conversation.status}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status} className="bg-white">
                  {formatEnum(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">
              Priority
            </span>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none cursor-pointer focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] disabled:cursor-not-allowed transition-colors shadow-sm"
              disabled={actionLoading}
              onChange={(event) =>
                onPriorityChange(event.target.value as Priority)
              }
              value={conversation.priority}
            >
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority} className="bg-white">
                  {formatEnum(priority)}
                </option>
              ))}
            </select>
          </label>

          {conversation.assignedAgent ? (
            <div className="flex flex-col gap-2">
              <div className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-700 shadow-sm">
                <UserCheck size={16} aria-hidden="true" className="text-emerald-500" />
                Assigned to {conversation.assignedAgent.name || "Agent"}
              </div>
              {(currentUser.role === "ADMIN" || currentUser.id === conversation.assignedAgent.id) && onUnassign && (
                <button
                  className="flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-transparent border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                Assign to Agent
              </span>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none cursor-pointer focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] disabled:cursor-not-allowed transition-colors shadow-sm"
                disabled={actionLoading}
                onChange={(event) => {
                  if (event.target.value && onAssignAgent) {
                    onAssignAgent(event.target.value);
                  }
                }}
                value=""
              >
                <option value="" disabled className="bg-white">Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-white">
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white shadow-sm text-sm font-semibold cursor-pointer text-slate-700 hover:bg-slate-50 hover:text-[#EE0033] hover:border-[#EE0033]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    ? "bg-slate-700 text-white border-transparent"
    : "bg-indigo-600 text-white border-transparent";

  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize border ${colors}`}>
      {icon}
      {channelOptions.find((option) => option.value === channelType)?.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ConversationStatus }) {
  const colors = {
    NEW: "bg-[#EE0033] text-white border-transparent",
    IN_PROGRESS: "bg-blue-600 text-white border-transparent",
    WAITING_CUSTOMER: "bg-amber-500 text-white border-transparent",
    RESOLVED: "bg-emerald-600 text-white border-transparent",
    CLOSED: "bg-slate-500 text-white border-transparent",
  }[status] || "bg-slate-500 text-white border-transparent";

  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize border ${colors}`}>
      {formatEnum(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const className =
    priority === "URGENT"
      ? "bg-rose-600 text-white border-transparent"
      : priority === "HIGH"
        ? "bg-orange-600 text-white border-transparent"
        : priority === "MEDIUM"
          ? "bg-amber-600 text-white border-transparent"
          : "bg-slate-500 text-white border-transparent";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize border ${className}`}
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
