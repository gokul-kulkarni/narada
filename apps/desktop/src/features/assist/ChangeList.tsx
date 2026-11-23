import type { RequestChange } from "@narada/core/assist/patch";

const VALUE = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs break-all whitespace-pre-wrap";

/** Before/after of each changed part of a request. */
export function ChangeList({ changes }: { changes: readonly RequestChange[] }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {changes.map((change) => (
        <div key={change.label}>
          <dt className="font-semibold">{change.label}</dt>
          <dd className="mt-0.5 flex flex-col gap-1">
            {change.before !== null && (
              <span className={`${VALUE} text-muted line-through`}>{change.before}</span>
            )}
            <span className={VALUE}>{change.after ?? "(removed)"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
