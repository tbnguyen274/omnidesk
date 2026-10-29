"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AuthLoadingScreen } from "@/features/auth/auth-loading-screen";
import { createLoginUrl } from "@/features/auth/auth-navigation";
import { useAuth } from "@/features/auth/auth-provider";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, currentUser, authLoading, handleLogout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const authenticated = Boolean(token && currentUser);

  useEffect(() => {
    if (!authLoading && !authenticated && !loggingOut) {
      const returnTo = `${pathname}${window.location.search}${window.location.hash}`;
      router.replace(createLoginUrl(returnTo));
    }
  }, [authLoading, authenticated, loggingOut, pathname, router]);

  async function handleAppLogout() {
    setLoggingOut(true);
    await handleLogout();
    router.replace("/login");
  }

  if (authLoading || !currentUser || !token || loggingOut) {
    return <AuthLoadingScreen />;
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-[#F8F9FB] p-2 sm:p-4 text-slate-800 font-sans">
      <div className="flex h-full flex-col gap-4">
        <div className="shrink-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <AppHeader currentUser={currentUser} onLogout={handleAppLogout} />
        </div>
        {children}
      </div>
    </main>
  );
}
