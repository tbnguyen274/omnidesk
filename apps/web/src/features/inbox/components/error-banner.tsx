import { AlertCircle } from "lucide-react";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="m-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
