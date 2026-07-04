import { Reply } from "lucide-react";
import { HtmlMessageViewer } from "@/features/inbox/conversation-detail/html-message-viewer";
import { formatEnum, formatTime } from "@/features/inbox/utils/format";
import { linkify } from "@/features/inbox/utils/linkify";
import type { ConversationDetail } from "@/lib/api-types";

export function MessageBubble({
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
