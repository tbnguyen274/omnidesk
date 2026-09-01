"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import type { DeadLetterJob, QueueName } from "@/lib/api-types";
import {
  AlertCircle,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  CheckCircle2,
  Clock,
  ServerCrash,
  Inbox,
} from "lucide-react";
import Link from "next/link";

const QUEUES: { value: QueueName; label: string }[] = [
  { value: "inbound-events", label: "Inbound Events" },
  { value: "outbound-messages", label: "Outbound Messages" },
  { value: "email-sync", label: "Email Sync" },
  { value: "email-actions", label: "Email Actions" },
  { value: "sla-check", label: "SLA Check" },
  { value: "auto-close", label: "Auto Close" },
  { value: "analytics-aggregation", label: "Analytics Aggregation" },
];

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

function formatDate(ts: number | undefined) {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(ts));
}

export default function DeadLetterPage() {
  const { token, currentUser } = useAuth();
  const [queue, setQueue] = useState<QueueName>("inbound-events");
  const [jobs, setJobs] = useState<DeadLetterJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!token) return;
    
    let mounted = true;
    async function fetchJobs() {
      try {
        const res = await apiClient.listDeadLetterJobs(token!, queue, 100);
        if (mounted) {
          setJobs(res.jobs);
          setTotal(res.total);
        }
      } catch {
        if (mounted) {
          showToast("error", "Failed to load dead-letter jobs.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    
    fetchJobs();
    
    return () => {
      mounted = false;
    };
  }, [token, queue, refreshCounter, showToast]);

  const handleReplay = async (jobId: string) => {
    if (!token || replayingId) return;
    setReplayingId(jobId);
    try {
      await apiClient.replayDeadLetterJob(token, queue, jobId);
      showToast("success", `Job ${jobId} queued for re-processing.`);
      // optimistic remove from list
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Replay failed.";
      showToast("error", message);
    } finally {
      setReplayingId(null);
    }
  };

  if (!currentUser) return null;

  if (currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="rounded-2xl bg-[#F8F9FB] p-8 text-center max-w-md shadow-sm border border-slate-200">
          <AlertCircle className="mx-auto h-12 w-12 text-[#EE0033] mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-500 mb-6">
            Administrator privileges required.
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#EE0033] px-6 text-sm font-semibold text-white transition-all hover:bg-[#c4002a] shadow-md shadow-[#EE0033]/20"
          >
            Return to Inbox
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Toast ──────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl text-sm font-medium transition-all animate-in slide-in-from-bottom-4 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      <div className="p-6 lg:p-8">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <ServerCrash className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Dead-Letter Queue
              </h1>
              <p className="text-sm text-slate-500">
                Inspect and replay failed background jobs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Queue selector */}
            <div className="relative">
              <select
                id="queue-select"
                value={queue}
                onChange={(e) => {
                  setLoading(true);
                  setQueue(e.target.value as QueueName);
                }}
                className="appearance-none h-10 pl-4 pr-10 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#EE0033]/30 focus:border-[#EE0033] cursor-pointer"
              >
                {QUEUES.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>

            {/* Refresh */}
            <button
              id="refresh-dlq-btn"
              onClick={() => {
                setLoading(true);
                setRefreshCounter((c) => c + 1);
              }}
              disabled={loading}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Stats bar ──────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-100 px-5 py-3">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
          <span className="text-sm font-medium text-rose-700">
            {loading
              ? "Loading…"
              : `${total} failed job${total !== 1 ? "s" : ""} in`}
          </span>
          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-mono font-semibold text-rose-800">
            {queue}
          </span>
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#EE0033]" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-lg font-semibold text-slate-700 mb-1">
              No failed jobs
            </p>
            <p className="text-sm text-slate-400">
              Queue <span className="font-mono font-medium">{queue}</span> is
              clean.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '42%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3.5 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Job</th>
                  <th className="px-4 py-3.5 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Failed Reason</th>
                  <th className="px-4 py-3.5 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Tries</th>
                  <th className="px-4 py-3.5 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Failed At</th>
                  <th className="px-4 py-3.5 text-right font-semibold text-slate-600 text-xs uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job, idx) => {
                  const jobId = job.id ?? `unknown-${idx}`;
                  const isReplaying = replayingId === jobId;
                  const isPermanent = job.failedReason?.startsWith("[permanent]");

                  return (
                    <tr
                      key={jobId}
                      className="group hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Job */}
                      <td className="px-4 py-3.5 align-middle overflow-hidden">
                        <p className="font-semibold text-slate-800 truncate text-xs mb-0.5">{job.name}</p>
                        <p className="font-mono text-[11px] text-slate-400 truncate">{jobId}</p>
                      </td>

                      {/* Reason */}
                      <td className="px-4 py-3.5 align-middle overflow-hidden">
                        <div className="flex flex-col gap-1">
                          {isPermanent ? (
                            <span className="self-start inline-flex items-center rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wide">
                              Permanent
                            </span>
                          ) : (
                            <span className="self-start inline-flex items-center rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                              Transient
                            </span>
                          )}
                          <span className="text-xs text-slate-500 leading-relaxed break-words">
                            {job.failedReason || "Unknown error"}
                          </span>
                        </div>
                      </td>

                      {/* Attempts */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {job.attemptsMade}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3.5 align-middle text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(job.finishedOn)}
                      </td>

                      {/* Replay */}
                      <td className="px-4 py-3.5 align-middle text-right">
                        <button
                          id={`replay-job-${jobId}`}
                          onClick={() => void handleReplay(jobId)}
                          disabled={!!replayingId}
                          title={
                            isPermanent
                              ? "This job failed permanently — replaying may fail again"
                              : "Re-queue this job for processing"
                          }
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                            isPermanent
                              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              : "bg-[#EE0033] text-white hover:bg-[#c4002a] shadow-sm shadow-[#EE0033]/20"
                          }`}
                        >
                          <RotateCcw
                            className={`h-3.5 w-3.5 ${isReplaying ? "animate-spin" : ""}`}
                          />
                          {isReplaying ? "…" : "Replay"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
