"use client";

import { AlertCircle, Check, Eye, EyeOff, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { apiClient } from "@/lib/api-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("Invalid or missing reset token.");
      setStatus("error");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setStatus("error");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      await apiClient.resetPassword(token, password);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 rounded-full bg-red-100 p-4 text-red-600">
          <AlertCircle size={32} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-slate-900">Invalid Link</h2>
        <p className="mb-6 text-sm text-slate-500">
          This password reset link is invalid or missing the token. Please request a new link.
        </p>
        <Link href="/" className="text-sm font-semibold text-[#EE0033] hover:underline">
          Return to Login
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Check size={32} />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900">Password Reset</h2>
        <p className="mb-8 text-slate-500">
          Your password has been successfully reset. You can now log in with your new password.
        </p>
        <button
          onClick={() => router.push("/")}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[#EE0033] text-sm font-bold text-white shadow-md shadow-[#EE0033]/20 transition-all hover:bg-[#c4002a] hover:shadow-lg hover:shadow-[#EE0033]/30"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <form className="p-10" onSubmit={handleSubmit}>
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EE0033] text-white shadow-lg shadow-[#EE0033]/30">
          <Inbox size={32} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">OmniDesk</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Set New Password</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="password">
            New Password
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

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="confirm-password">
            Confirm Password
          </label>
          <div className="relative">
            <input
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-4 pr-11 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:bg-white focus:border-[#EE0033] focus:ring-1 focus:ring-[#EE0033]"
              id="confirm-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
            />
          </div>
        </div>
      </div>

      {status === "error" && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <button
        className="mt-8 flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#EE0033] text-sm font-bold text-white shadow-md shadow-[#EE0033]/20 transition-all hover:bg-[#c4002a] hover:shadow-lg hover:shadow-[#EE0033]/30 disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={status === "loading" || !password || !confirmPassword}
      >
        {status === "loading" ? "Resetting..." : "Reset Password"}
      </button>

      <div className="mt-5 text-center">
        <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 hover:underline">
          Cancel and return to Login
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F9FB] p-4 font-sans">
      {/* Dynamic Background Elements - Wavy lines and blurry blob */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
        {/* Blurry red blob behind the form */}
        <div className="absolute h-[600px] w-[600px] rounded-full bg-[#EE0033]/10 blur-[100px]" />

        {/* SVG curved lines matching the reference */}
        <svg
          className="absolute h-[150vh] w-[150vw] min-w-[1440px] opacity-70"
          preserveAspectRatio="none"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M-200 600 C 300 200, 800 800, 1600 300" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.6" fill="none" />
          <path d="M-200 650 C 400 300, 900 700, 1600 200" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.4" fill="none" />
          <path d="M-200 700 C 500 400, 1000 600, 1600 100" stroke="#EE0033" strokeWidth="0.5" strokeOpacity="0.2" fill="none" />
          <path d="M-200 300 C 400 -50, 900 1100, 1600 800" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.5" fill="none" />
          <path d="M-200 350 C 500 0, 1000 1000, 1600 700" stroke="#9CA3AF" strokeWidth="0.5" strokeOpacity="0.3" fill="none" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="rounded-[32px] border border-white/80 bg-white/60 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#EE0033]/30 border-t-[#EE0033]"></div>
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
