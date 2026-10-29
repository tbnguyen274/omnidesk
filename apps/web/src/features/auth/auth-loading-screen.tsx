import { LoadingIndicator } from "@/components/ui/loading-indicator";

export function AuthLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FB]">
      <LoadingIndicator />
    </main>
  );
}
