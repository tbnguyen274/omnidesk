"use client";

import { useMemo, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { ChannelBadge, PriorityBadge, StatusBadge } from "@/features/inbox/components/badges";
import { PaneState } from "@/features/inbox/components/pane-state";
import { MessageBubble } from "@/features/inbox/conversation-detail/message-bubble";
import { ReplyComposer } from "@/features/inbox/reply/reply-composer";
import { useConversationScroll } from "@/features/inbox/conversation-detail/hooks/use-conversation-scroll";
import { useMessagePagination } from "@/features/inbox/conversation-detail/hooks/use-message-pagination";
import type { ConversationDetail, OutboundAttachmentItem } from "@/lib/api-types";

export function ConversationDetailPanel({
  conversation,
  loading,
  onSendReply,
  replyDisabledReason,
  typingAgents,
  onTypingChange,
  onLoadOlderMessages,
  onReadStatusChange,
  showSidePanel,
  onToggleSidePanel,
  token,
}: {
  conversation: ConversationDetail | null;
  loading: boolean;
  onSendReply?: (
    content: string,
    attachments?: OutboundAttachmentItem[],
  ) => Promise<void>;
  replyDisabledReason?: string | null;
  typingAgents?: string[];
  onTypingChange?: (isTyping: boolean) => void;
  onLoadOlderMessages?: () => Promise<void>;
  onReadStatusChange?: (isRead: boolean) => Promise<void>;
  showSidePanel?: boolean;
  onToggleSidePanel?: () => void;
  token?: string | null;
}) {
  const sortedMessages = useMemo(
    () => conversation?.messages ?? [],
    [conversation],
  );

  const [replyingToMessage, setReplyingToMessage] = useState<
    ConversationDetail["messages"][number] | null
  >(null);

  const { scrollRef, prepareForOlderMessages, updateStickToBottom } =
    useConversationScroll({
      conversationId: conversation?.id,
      messages: sortedMessages,
    });

  const { isLoadingOlder, loadOlder } = useMessagePagination({
    conversationId: conversation?.id,
    messageCount: sortedMessages.length,
    onLoadOlderMessages,
    onPrepareScroll: prepareForOlderMessages,
  });

  const handleScroll = async () => {
    if (!scrollRef.current) return;
    updateStickToBottom();
    await loadOlder(scrollRef.current.scrollTop);
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
        <div className="flex items-center gap-2 shrink-0 ml-4">
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
          {onToggleSidePanel && (
            <button
              onClick={onToggleSidePanel}
              title={showSidePanel ? "Collapse sidebar (Thu gọn)" : "Expand sidebar (Mở rộng thông tin)"}
              className={`p-1.5 rounded-[8px] border transition-colors cursor-pointer ${
                showSidePanel
                  ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-[#EE0033] hover:text-[#EE0033]"
              }`}
            >
              {showSidePanel ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#F8F9FB]" ref={scrollRef} onScroll={handleScroll}>
        <div className={`flex flex-col gap-4 w-full transition-all duration-200 ${showSidePanel ? "max-w-4xl mx-auto" : "max-w-none px-1 sm:px-4 lg:px-6"}`}>
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
        token={token}
        onSendReply={async (content, attachments) => {
          await onSendReply?.(content, attachments);
          setReplyingToMessage(null);
        }}
        replyingToMessage={replyingToMessage}
        onCancelReply={() => setReplyingToMessage(null)}
        onTypingChange={onTypingChange}
      />
    </div>
  );
}
