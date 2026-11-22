import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-backdrop p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>
        <div className="overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
