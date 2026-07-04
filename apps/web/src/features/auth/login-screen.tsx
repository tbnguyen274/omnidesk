"use client";

import { Check, Eye, EyeOff, Inbox, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { apiClient } from "@/lib/api-client";

export function LoginScreen({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("agent@omnidesk.local");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [forgotError, setForgotError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email, password);
    setSubmitting(false);
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotStatus("loading");
    setForgotError("");

    try {
      await apiClient.forgotPassword(forgotEmail);
      setForgotStatus("success");
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "An error occurred");
      setForgotStatus("error");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#F8F9FB] overflow-hidden p-4 font-sans">
      {/* Dynamic Background Elements - Wavy lines and blurry blob */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden flex items-center justify-center">
        {/* Blurry red blob behind the form */}
        <div className="absolute h-[600px] w-[600px] rounded-full bg-[#EE0033]/10 blur-[100px]" />
        
        {/* SVG curved lines matching the reference */}
        <svg className="absolute w-[150vw] h-[150vh] min-w-[1440px] opacity-70" preserveAspectRatio="none" viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-200 600 C 300 200, 800 800, 1600 300" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.6" fill="none" />
          <path d="M-200 650 C 400 300, 900 700, 1600 200" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
          <path d="M-200 700 C 500 400, 1000 600, 1600 100" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.2" fill="none" />
          
          <path d="M-200 300 C 400 -50, 900 1100, 1600 800" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.5" fill="none" />
          <path d="M-200 350 C 500 0, 1000 1000, 1600 700" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.3" fill="none" />
        </svg>
      </div>
      
      <div className="relative z-10 w-full max-w-[440px]">
        <form
          className="rounded-[32px] border border-white/80 bg-white/60 backdrop-blur-2xl p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] transition-all"
          onSubmit={handleSubmit}
        >
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EE0033] text-white shadow-lg shadow-[#EE0033]/30">
              <Inbox size={32} strokeWidth={2.5} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">OmniDesk</h1>
              <p className="text-sm text-slate-500 font-medium mt-1">Enterprise Agent Login</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="email">
                Email Address
              </label>
              <input
                className="h-12 w-full rounded-xl border border-[#EE0033] bg-slate-50/80 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="agent@omnidesk.local"
                value={email}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  className="h-12 w-full rounded-xl border border-[#EE0033] bg-slate-50/80 pl-4 pr-11 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                  id="password"
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 flex h-12 w-12 cursor-pointer items-center justify-center text-[#EE0033] hover:text-[#c4002a] focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm font-medium text-red-600">
              {error}
            </div>
          ) : null}

          <button
            className="mt-8 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#EE0033] text-sm font-bold text-white transition-all hover:bg-[#d6002e] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100 shadow-md shadow-[#EE0033]/20"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Sign in to Workspace
              </>
            )}
          </button>

          <div className="mt-5 text-center">
            <button
              type="button"
              className="text-sm font-semibold text-[#EE0033] hover:underline"
              onClick={() => setForgotPasswordModalOpen(true)}
            >
              Forgot Password?
            </button>
          </div>
        </form>

      </div>

      {/* Forgot Password Modal */}
      {forgotPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Reset Password</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setForgotPasswordModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {forgotStatus === "success" ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={24} />
                </div>
                <h3 className="mb-2 text-lg font-medium text-slate-900">Check your email</h3>
                <p className="text-sm text-slate-500">
                  We sent a password reset link to <span className="font-medium text-slate-800">{forgotEmail}</span>
                </p>
                <button
                  type="button"
                  className="mt-6 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => setForgotPasswordModalOpen(false)}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <p className="mb-4 text-sm text-slate-500">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="forgot-email">
                    Email Address
                  </label>
                  <input
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033]"
                    id="forgot-email"
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>

                {forgotStatus === "error" && (
                  <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-100">
                    {forgotError}
                  </div>
                )}

                <button
                  className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#EE0033] text-sm font-bold text-white shadow-md shadow-[#EE0033]/20 hover:bg-[#c4002a] hover:shadow-lg hover:shadow-[#EE0033]/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={forgotStatus === "loading" || !forgotEmail}
                >
                  {forgotStatus === "loading" ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
