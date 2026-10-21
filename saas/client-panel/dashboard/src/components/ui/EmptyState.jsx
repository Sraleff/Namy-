export default function EmptyState({ children, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <p className="text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}
