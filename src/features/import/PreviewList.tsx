import type { ImportPreview } from "../../lib/import-preview";

const BADGES: Record<string, string> = {
  collection: "Collection",
  environment: "Environment",
  curl: "cURL",
};

export function PreviewList({
  previews,
  onRemove,
}: {
  previews: readonly ImportPreview[];
  onRemove: (index: number) => void;
}) {
  if (previews.length === 0) return null;
  return (
    <ul
      aria-label="Ready to import"
      className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line"
    >
      {previews.map((preview, index) => (
        <li key={`${preview.source}-${index}`} className="flex items-start gap-3 px-4 py-3">
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              preview.ok ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
            }`}
          >
            {preview.ok ? BADGES[preview.kind] : "Can't import"}
          </span>
          <div className="min-w-0 flex-1">
            {preview.ok ? (
              <>
                <p className="truncate font-semibold">{preview.title}</p>
                <p className="text-xs text-muted">
                  {preview.detail} · {preview.source}
                </p>
              </>
            ) : (
              <>
                <p className="truncate font-semibold">{preview.source}</p>
                <p role="alert" className="text-xs text-err">
                  {preview.message}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            aria-label={`Remove ${preview.source}`}
            className="rounded-md px-1.5 text-muted hover:bg-surface-2 hover:text-err"
            onClick={() => onRemove(index)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
