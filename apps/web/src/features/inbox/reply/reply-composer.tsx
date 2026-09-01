"use client";

import { ImageIcon, Paperclip, Reply, Send, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/features/inbox/utils/format";
import { apiClient } from "@/lib/api-client";
import type {
  ConversationDetail,
  OutboundAttachmentItem,
  UploadAttachmentResponse,
} from "@/lib/api-types";

type PendingFile = {
  id: string;
  file: File;
  preview?: string;   // object URL for images
  result?: UploadAttachmentResponse;
  uploading: boolean;
  error?: string;
};

export function ReplyComposer({
  disabledReason,
  onSendReply,
  replyingToMessage,
  onCancelReply,
  onTypingChange,
  token,
}: {
  disabledReason?: string | null;
  onSendReply?: (
    content: string,
    attachments?: OutboundAttachmentItem[],
  ) => Promise<void>;
  replyingToMessage?: ConversationDetail["messages"][number] | null;
  onCancelReply?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  token?: string | null;
}) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onTypingChange?.(content.length > 0);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [content, onTypingChange]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      for (const f of pendingFiles) {
        if (f.preview) URL.revokeObjectURL(f.preview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUploading = pendingFiles.some((f) => f.uploading);
  const trimmedContent = content.trim();
  const disabled =
    submitting ||
    hasUploading ||
    !onSendReply ||
    Boolean(disabledReason) ||
    (!trimmedContent && pendingFiles.length === 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || !onSendReply) return;

    setError(null);
    setSubmitting(true);

    try {
      const attachments = pendingFiles
        .filter((f) => f.result)
        .map((f) => ({
          url: f.result!.url,
          fileName: f.result!.fileName,
          mimeType: f.result!.mimeType,
          sizeBytes: f.result!.sizeBytes,
        }));

      await onSendReply(
        trimmedContent,
        attachments.length > 0 ? attachments : undefined,
      );
      setContent("");
      // Cleanup previews
      for (const f of pendingFiles) {
        if (f.preview) URL.revokeObjectURL(f.preview);
      }
      setPendingFiles([]);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    // Reset input so the same file can be re-selected after removal
    event.target.value = "";

    const newEntries: PendingFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
      uploading: true,
    }));

    setPendingFiles((prev) => [...prev, ...newEntries]);

    // Upload each file immediately
    for (const entry of newEntries) {
      try {
        if (!token) throw new Error("Not authenticated");
        const result = await apiClient.uploadAttachment(token, entry.file);
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, uploading: false, result } : f,
          ),
        );
      } catch (err) {
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, uploading: false, error: getErrorMessage(err) }
              : f,
          ),
        );
      }
    }
  }

  function removeFile(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  }

  return (
    <form
      ref={formRef}
      className="border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10"
      onSubmit={handleSubmit}
    >
      {/* Reply-to banner */}
      {replyingToMessage && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-2 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 truncate">
            <Reply size={14} className="text-slate-400" />
            <span className="font-semibold text-slate-800">Replying to:</span>
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

      {/* File preview strip */}
      {pendingFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingFiles.map((f) => (
            <div
              key={f.id}
              className={`relative flex items-center gap-2 rounded-xl border p-2 text-xs transition-colors ${
                f.error
                  ? "border-rose-300 bg-rose-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              {/* Thumbnail or file icon */}
              {f.preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                  <ImageIcon size={18} className="text-slate-400" />
                </div>
              )}

              <div className="min-w-0 max-w-[120px]">
                <p className="truncate font-medium text-slate-800">
                  {f.file.name}
                </p>
                {f.uploading && (
                  <p className="text-slate-400 animate-pulse">Uploading…</p>
                )}
                {f.error && (
                  <p className="text-rose-500 truncate">{f.error}</p>
                )}
                {f.result && !f.uploading && (
                  <p className="text-emerald-600">Ready</p>
                )}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-white hover:bg-slate-600 transition-colors cursor-pointer"
                title="Remove file"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main input row */}
      <div className="flex gap-2 items-center">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={handleFileChange}
        />

        {/* Paperclip button */}
        <button
          type="button"
          className={`flex shrink-0 items-center justify-center h-10 w-10 rounded-xl transition-colors cursor-pointer ${
            hasUploading
              ? "text-[#EE0033] animate-pulse bg-red-50"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          }`}
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
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
          placeholder={
            pendingFiles.length > 0
              ? "Add a caption (optional)…"
              : "Write a reply (Enter to send, Shift+Enter for new line)"
          }
          value={content}
        />

        <button
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#EE0033] text-white cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 hover:bg-[#d6002e] shadow-md shadow-[#EE0033]/20 transition-all active:scale-95"
          disabled={disabled}
          title={
            hasUploading
              ? "Waiting for uploads…"
              : (disabledReason ?? "Send reply")
          }
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
