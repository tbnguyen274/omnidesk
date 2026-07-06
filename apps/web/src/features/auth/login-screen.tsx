"use client";

import { Eye, EyeOff, Inbox } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ForgotPasswordModal } from "@/features/auth/forgot-password-modal";

export function LoginScreen({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await onLogin(email, password);
    setSubmitting(false);
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
                Email
              </label>
              <input
                className="h-12 w-full rounded-xl border border-[#EE0033] bg-slate-50/80 px-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:ring-1 focus:ring-[#EE0033]"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
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
              className="text-sm font-semibold text-[#EE0033] hover:underline cursor-pointer transition-colors"
              onClick={() => setForgotPasswordModalOpen(true)}
            >
              Forgot Password?
            </button>
          </div>
        </form>

      </div>

      {forgotPasswordModalOpen && (
        <ForgotPasswordModal onClose={() => setForgotPasswordModalOpen(false)} />
      )}
    </main>
  );
}
