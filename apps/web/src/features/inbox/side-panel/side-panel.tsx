import { UserCheck } from "lucide-react";
import { priorityOptions, statusOptions } from "@/features/inbox/constants";
import { PaneState } from "@/features/inbox/components/pane-state";
import { TagsSection } from "@/features/inbox/side-panel/tags-section";
import { formatEnum, getInitials } from "@/features/inbox/utils/format";
import type { ConversationDetail, ConversationStatus, CurrentUser, Priority } from "@/lib/api-types";

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
