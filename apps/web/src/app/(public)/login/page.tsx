import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLoadingScreen } from "@/features/auth/auth-loading-screen";
import { LoginPageScreen } from "@/features/auth/login-page-screen";

export const metadata: Metadata = { title: "Login | OmniDesk" };

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoadingScreen />}>
      <LoginPageScreen />
    </Suspense>
  );
}
