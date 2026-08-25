"use client";

import { useState } from "react";
import { useInboxController } from "@/features/inbox/hooks/use-inbox-controller";
import {
  ConversationDetailPanel,
  ConversationList,
  ErrorBanner,
  InboxFilters,
  SidePanel,
} from "@/features/inbox/inbox-components";

export default function Home() {
  const inbox = useInboxController();
  const [showSidePanel, setShowSidePanel] = useState(true);

  if (!inbox.currentUser) {
    return null;
  }

  return (
    <section
      className={`grid min-h-0 flex-1 grid-cols-1 gap-4 transition-all duration-300 ${
        showSidePanel
          ? "lg:grid-cols-[340px_minmax(0,1fr)_320px]"
          : "lg:grid-cols-[340px_minmax(0,1fr)]"
      }`}
    >
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <InboxFilters
          filters={inbox.filters}
          loading={inbox.listLoading}
          onChange={inbox.setFilters}
          onRefresh={inbox.refreshConversations}
          onSearch={inbox.handleSearchSubmit}
        />
        <ConversationList
          conversations={inbox.conversations}
          loading={inbox.listLoading}
          selectedId={inbox.selectedId}
          onSelect={inbox.selectConversation}
        />
      </aside>

      <section className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {inbox.error ? <ErrorBanner message={inbox.error} /> : null}
        <ConversationDetailPanel
          key={inbox.selectedConversation?.id ?? "empty"}
          conversation={inbox.selectedConversation}
          loading={inbox.detailLoading}
          onSendReply={inbox.handleSendReply}
          replyDisabledReason={inbox.replyDisabledReason}
          token={inbox.token}
          typingAgents={
            inbox.selectedId ? inbox.typingAgents[inbox.selectedId] : undefined
          }
          onTypingChange={inbox.sendTyping}
          onLoadOlderMessages={inbox.handleLoadOlderMessages}
          onReadStatusChange={inbox.handleUpdateReadStatus}
          showSidePanel={showSidePanel}
          onToggleSidePanel={() => setShowSidePanel((prev) => !prev)}
        />
      </section>

      {showSidePanel && (
        <aside className="flex min-h-0 flex-col overflow-y-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm animate-in fade-in duration-200">
          <SidePanel
            actionLoading={inbox.actionLoading}
            agents={inbox.agents}
            conversation={inbox.selectedConversation}
            currentUser={inbox.currentUser}
            tags={inbox.tags}
            onAssignAgent={inbox.handleAssignAgent}
            onAssignToMe={inbox.handleAssignToMe}
            onUnassign={inbox.handleUnassign}
            onPriorityChange={inbox.handlePriorityChange}
            onStatusChange={inbox.handleStatusChange}
            onAddTag={inbox.handleAddTag}
            onCreateTag={inbox.handleCreateTag}
            onRemoveTag={inbox.handleRemoveTag}
            onClose={() => setShowSidePanel(false)}
          />
        </aside>
      )}
    </section>
  );
}
