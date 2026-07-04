"use client";

import { RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { channelOptions, priorityOptions, statusOptions } from "@/features/inbox/constants";
import { formatEnum } from "@/features/inbox/utils/format";
import type { ChannelType, ConversationFilters, ConversationStatus, Priority } from "@/lib/api-types";

export function InboxFilters({
  filters,
  loading,
  onChange,
  onRefresh,
  onSearch,
}: {
  filters: ConversationFilters;
  loading: boolean;
  onChange: (filters: ConversationFilters) => void;
  onRefresh: () => void;
  onSearch: (search: string) => void;
}) {
  const [search, setSearch] = useState(filters.search ?? "");

  return (
    <div className="border-b border-slate-200 bg-white p-4">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(search);
        }}
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
            aria-hidden="true"
          />
          <input
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] transition-all shadow-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            value={search}
          />
        </div>
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-[#EE0033] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          disabled={loading}
          title="Refresh inbox"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </form>

      <div className="grid grid-cols-3 gap-2">
        <FilterSelect
          label="Channel"
          value={filters.channelType ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              channelType: (value || undefined) as ChannelType | undefined,
            })
          }
          options={channelOptions}
        />
        <FilterSelect
          label="Status"
          value={filters.status ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              status: (value || undefined) as ConversationStatus | undefined,
            })
          }
          options={statusOptions.map((status) => ({
            value: status,
            label: formatEnum(status),
          }))}
        />
        <FilterSelect
          label="Priority"
          value={filters.priority ?? ""}
          onChange={(value) =>
            onChange({
              ...filters,
              priority: (value || undefined) as Priority | undefined,
            })
          }
          options={priorityOptions.map((priority) => ({
            value: priority,
            label: formatEnum(priority),
          }))}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">
        {label}
      </span>
      <select
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700 outline-none cursor-pointer focus:border-[#EE0033] focus:bg-white focus:ring-1 focus:ring-[#EE0033] transition-colors shadow-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="" className="bg-white text-slate-700">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-700">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
