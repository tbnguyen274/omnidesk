export function PaneState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
