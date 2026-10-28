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
      className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800"
    >
      {previews.map((preview, index) => (
        <li key={`${preview.source}-${index}`} className="flex items-start gap-2 px-3 py-2">
          <span
            className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${
              preview.ok
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
                : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {preview.ok ? BADGES[preview.kind] : "Can't import"}
          </span>
          <div className="min-w-0 flex-1">
            {preview.ok ? (
              <>
                <p className="truncate font-medium">{preview.title}</p>
                <p className="text-xs text-neutral-500">
                  {preview.detail} · {preview.source}
                </p>
              </>
            ) : (
              <>
                <p className="truncate font-medium">{preview.source}</p>
                <p role="alert" className="text-xs text-red-600">
                  {preview.message}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            aria-label={`Remove ${preview.source}`}
            className="text-neutral-400 hover:text-neutral-700"
            onClick={() => onRemove(index)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
