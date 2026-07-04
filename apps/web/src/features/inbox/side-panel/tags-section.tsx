"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

export function TagsSection({
  actionLoading,
  tags = [],
  conversationTags = [],
  onAddTag,
  onCreateTag,
  onRemoveTag,
}: {
  actionLoading: boolean;
  tags?: { id: string; name: string; color?: string | null }[];
  conversationTags: { id: string; name: string; color?: string | null }[];
  onAddTag?: (tagId: string) => void;
  onCreateTag?: (name: string, color?: string) => void;
  onRemoveTag?: (tagId: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      const name = inputValue.trim().toLowerCase();
      const existing = tags.find((t) => t.name.toLowerCase() === name);
      if (existing) {
        onAddTag?.(existing.id);
      } else {
        onCreateTag?.(name);
      }
      setInputValue("");
      setIsAdding(false);
    } else if (e.key === "Escape") {
      setInputValue("");
      setIsAdding(false);
    }
  };

  const filteredTags = tags.filter(
    (t) =>
      t.name.toLowerCase().includes(inputValue.trim().toLowerCase()) &&
      !conversationTags.find((ct) => ct.id === t.id)
  );

  const exactMatch = tags.some((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <section className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Tags</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {conversationTags.map((tag) => (
          <span
            className="group flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 pl-2 pr-1 py-1 text-xs font-semibold text-slate-700"
            key={tag.id}
          >
            {tag.name}
            <button
              onClick={() => onRemoveTag?.(tag.id)}
              disabled={actionLoading}
              className="text-slate-400 hover:text-[#EE0033] focus:outline-none disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove tag"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {conversationTags.length === 0 && !isAdding && (
          <p className="text-xs font-medium text-slate-400">No tags</p>
        )}
        
        {!isAdding ? (
          <button
            onClick={() => setIsAdding(true)}
            disabled={actionLoading}
            className="flex items-center gap-1 rounded-md bg-transparent border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#EE0033] hover:border-[#EE0033] hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add tag
          </button>
        ) : (
          <div className="relative">
            <input
              autoFocus
              type="text"
              placeholder="Tag name..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // slight delay to allow click on options
                setTimeout(() => {
                  if (!inputValue.trim()) {
                    setIsAdding(false);
                  }
                }, 150);
              }}
              disabled={actionLoading}
              className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033] disabled:cursor-not-allowed transition-colors"
            />
            {inputValue.trim() && (
              <div className="absolute top-full left-0 z-10 w-48 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                {filteredTags.map((t) => (
                  <button
                    key={t.id}
                    className="block w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAddTag?.(t.id);
                      setInputValue("");
                      setIsAdding(false);
                    }}
                  >
                    {t.name}
                  </button>
                ))}
                {!exactMatch && (
                  <button
                    className="block w-full text-left px-3 py-2 text-xs font-semibold text-[#EE0033] hover:bg-red-50 transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onCreateTag?.(inputValue.trim().toLowerCase());
                      setInputValue("");
                      setIsAdding(false);
                    }}
                  >
                    Create &quot;{inputValue.trim().toLowerCase()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
