import { ChannelBadge, PriorityBadge, StatusBadge } from "@/features/inbox/components/badges";
import { PaneState } from "@/features/inbox/components/pane-state";
import { formatMessagePreview } from "@/features/inbox/utils/format";
import type { ConversationListItem } from "@/lib/api-types";

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
                {formatMessagePreview(
                  conversation.lastMessage?.content,
                  conversation.lastMessage?.contentType,
                )}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
