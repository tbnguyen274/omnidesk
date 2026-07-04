import type { ChannelType, ConversationStatus, Priority } from "@/lib/api-types";

export const channelOptions: Array<{ value: ChannelType; label: string }> = [
  { value: "FACEBOOK_MESSAGE", label: "Messenger" },
  { value: "FACEBOOK_COMMENT", label: "Comment" },
  { value: "EMAIL", label: "Email" },
];

export const statusOptions: ConversationStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
];

export const priorityOptions: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
