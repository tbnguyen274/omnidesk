"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthLoadingScreen } from "./auth-loading-screen";
import { getLoginDestination } from "./auth-navigation";
import { useAuth } from "./auth-provider";
import { LoginScreen } from "./login-screen";

/** Bind the login form to session state and the public /login route. */
export function LoginPageScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, currentUser, authLoading, authError, handleLogin } = useAuth();
  const destination = getLoginDestination(searchParams.get("returnTo"));
  const authenticated = Boolean(token && currentUser);

  useEffect(() => {
    if (!authLoading && authenticated) {
      router.replace(destination);
    }
  }, [authLoading, authenticated, destination, router]);

  if (authLoading || authenticated) {
    return <AuthLoadingScreen />;
  }

  return <LoginScreen error={authError} onLogin={handleLogin} />;
}
