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
    <ul aria-label="Ready to import" className="divide-y divide-line rounded border border-line">
      {previews.map((preview, index) => (
        <li key={`${preview.source}-${index}`} className="flex items-start gap-2 px-3 py-2">
          <span
            className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${
              preview.ok ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
            }`}
          >
            {preview.ok ? BADGES[preview.kind] : "Can't import"}
          </span>
          <div className="min-w-0 flex-1">
            {preview.ok ? (
              <>
                <p className="truncate font-medium">{preview.title}</p>
                <p className="text-xs text-muted">
                  {preview.detail} · {preview.source}
                </p>
              </>
            ) : (
              <>
                <p className="truncate font-medium">{preview.source}</p>
                <p role="alert" className="text-xs text-err">
                  {preview.message}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            aria-label={`Remove ${preview.source}`}
            className="text-muted hover:text-ink"
            onClick={() => onRemove(index)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
