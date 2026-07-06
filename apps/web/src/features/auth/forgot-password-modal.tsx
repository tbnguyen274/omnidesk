"use client";

import { Check, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { apiClient } from "@/lib/api-client";

export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      await apiClient.forgotPassword(email);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Reset Password</h2>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {status === "success" ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check size={24} />
            </div>
            <h3 className="mb-2 text-lg font-medium text-slate-900">Check your email</h3>
            <p className="text-sm text-slate-500">
              We sent a password reset link to{" "}
              <span className="font-medium text-slate-800">{email}</span>
            </p>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="mb-4 text-sm text-slate-500">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="forgot-email">
                Email
              </label>
              <input
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-[#EE0033] focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                id="forgot-email"
                type="email"
                required
                placeholder="Enter your email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {status === "error" && (
              <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#EE0033] text-sm font-bold text-white shadow-md shadow-[#EE0033]/20 transition-all hover:bg-[#c4002a] hover:shadow-lg hover:shadow-[#EE0033]/30 disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={status === "loading" || !email}
            >
              {status === "loading" ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
