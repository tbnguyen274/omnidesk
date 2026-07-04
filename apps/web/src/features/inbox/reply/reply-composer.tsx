"use client";

import { Paperclip, Reply, Send, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/features/inbox/utils/format";
import type { ConversationDetail } from "@/lib/api-types";

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
