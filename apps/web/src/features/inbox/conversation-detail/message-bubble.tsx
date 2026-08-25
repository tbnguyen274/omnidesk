import { Download, FileText, Reply } from "lucide-react";
import { HtmlMessageViewer } from "@/features/inbox/conversation-detail/html-message-viewer";
import { formatEnum, formatTime } from "@/features/inbox/utils/format";
import { linkify } from "@/features/inbox/utils/linkify";
import { API_BASE_URL } from "@/lib/app-config";
import type { Attachment, ConversationDetail } from "@/lib/api-types";

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
  const isFullDocument = /<!DOCTYPE|<html|<head|<body|<meta|<style/i.test(
    message.content || "",
  );
  const isHtml =
    isFullDocument ||
    message.contentType === "HTML" ||
    /<(?:div|p|span|blockquote|br|ul|ol|li|a|img|b|i|strong|em|table)\b[^>]*>/i.test(
      message.content || "",
    );

  return (
    <div className={`group flex ${outbound ? "justify-end" : "justify-start"} items-center gap-2 w-full`}>
      <div
        className={`${isFullDocument ? "w-full max-w-[95%]" : "max-w-[85%]"} rounded-2xl border px-4 py-3 relative shadow-sm overflow-hidden min-w-0 ${outbound
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
        {isHtml ? (
          <HtmlMessageViewer html={message.content} />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6 break-words">
            {linkify(message.content)}
          </p>
        )}

        {/* Attachment strip */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {message.attachments.map((att) => (
              <AttachmentItem key={att.id} attachment={att} outbound={outbound} />
            ))}
          </div>
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

function resolveAttachmentUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const cleanPath = url.startsWith("/") ? url : `/${url}`;
  if (/^\/api\/v\d+\//.test(cleanPath)) {
    const origin = API_BASE_URL.replace(/\/api\/v\d+$/, "");
    return `${origin}${cleanPath}`;
  }
  return `${API_BASE_URL}${cleanPath}`;
}

function AttachmentItem({
  attachment,
  outbound,
}: {
  attachment: Attachment;
  outbound: boolean;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const fullUrl = resolveAttachmentUrl(attachment.url);

  if (isImage) {
    return (
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl overflow-hidden max-w-[220px] hover:opacity-90 transition-opacity"
        title={attachment.fileName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fullUrl}
          alt={attachment.fileName}
          className="w-full object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.fileName}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
        outbound
          ? "bg-white/20 hover:bg-white/30 text-white"
          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
      }`}
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate max-w-[160px]">{attachment.fileName}</span>
      <Download size={14} className="shrink-0 ml-auto" />
    </a>
  );
}
