"use client";

import { useAuth } from "@/lib/auth-context";
import { AppHeader, LoginScreen } from "@/features/inbox/inbox-components";

const API_BASE_URL = "http://localhost:3000/api/v1";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { token, currentUser, authLoading, authError, handleLogin, handleLogout } = useAuth();

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FB]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#EE0033]"></div>
      </main>
    );
  }

  if (!token || !currentUser) {
    return <LoginScreen error={authError} onLogin={handleLogin} />;
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-[#F8F9FB] p-2 sm:p-4 text-slate-800 font-sans">
      <div className="flex h-full flex-col gap-4">
        {/* Floating Header used globally */}
        <div className="shrink-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <AppHeader
            apiBaseUrl={API_BASE_URL}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        </div>
        
        {/* Page Content */}
        {children}
      </div>
    </main>
  );
}
