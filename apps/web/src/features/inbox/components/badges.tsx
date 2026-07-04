import { Mail, MessageCircle } from "lucide-react";
import { channelOptions } from "@/features/inbox/constants";
import { formatEnum } from "@/features/inbox/utils/format";
import type { ChannelType, ConversationStatus, Priority } from "@/lib/api-types";

export function ChannelBadge({ channelType }: { channelType: ChannelType }) {
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

export function StatusBadge({ status }: { status: ConversationStatus }) {
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

export function PriorityBadge({ priority }: { priority: Priority }) {
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
