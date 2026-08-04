import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniDesk",
  description: "Omnichannel customer support workspace",
};

import { AuthProvider } from "@/lib/auth-context";
import { ClientLayout } from "./client-layout";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ClientLayout>{children}</ClientLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
