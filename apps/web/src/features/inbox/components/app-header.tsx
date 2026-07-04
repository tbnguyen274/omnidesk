"use client";

import { Inbox, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/lib/api-types";

export function AppHeader({
  apiBaseUrl,
  currentUser,
  onLogout,
}: {
  apiBaseUrl: string;
  currentUser: CurrentUser;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 shadow-sm z-10 relative">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EE0033] text-white shadow-md shadow-[#EE0033]/20">
            <Inbox size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">OmniDesk Inbox</h1>
            <p className="text-xs font-medium text-slate-500">{apiBaseUrl}</p>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-4 border-l border-slate-200 pl-6 h-10">
          <Link 
            href="/" 
            className={`text-sm transition-colors ${
              pathname === "/" || pathname?.startsWith("/inbox") 
                ? "font-semibold text-slate-900" 
                : "font-medium text-slate-500 hover:text-[#EE0033]"
            }`}
          >
            Inbox
          </Link>
          {currentUser.role === "ADMIN" && (
            <>
              <Link 
                href="/dashboard" 
                className={`text-sm transition-colors ${
                  pathname === "/dashboard" 
                    ? "font-semibold text-slate-900" 
                    : "font-medium text-slate-500 hover:text-[#EE0033]"
                }`}
              >
                Dashboard
              </Link>
              <Link 
                href="/user" 
                className={`text-sm transition-colors ${
                  pathname === "/user" || pathname?.startsWith("/user/") 
                    ? "font-semibold text-slate-900" 
                    : "font-medium text-slate-500 hover:text-[#EE0033]"
                }`}
              >
                Users
              </Link>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-bold text-slate-900">{currentUser.name}</p>
          <p className="text-xs font-medium text-slate-500">{currentUser.role}</p>
        </div>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 cursor-pointer hover:bg-slate-50 hover:text-[#EE0033] hover:border-[#EE0033]/30 transition-colors bg-white shadow-sm"
          onClick={onLogout}
          title="Logout"
          type="button"
        >
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
