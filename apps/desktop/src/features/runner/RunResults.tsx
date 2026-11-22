import { deliveryOutcome } from "../../lib/delivery";
import { formatDuration } from "../../lib/format";
import { summarizeRun, type RunRow } from "../../lib/runner";
import { StatusPill } from "../delivery/StatusPill";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="text-xs font-bold text-muted">{label}</div>
      <div className={`font-display text-3xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function RunRowItem({ row }: { row: RunRow }) {
  const outcome = deliveryOutcome(row.status);
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-8 shrink-0 text-xs font-bold text-muted" title="Iteration">
          #{row.iteration + 1}
        </span>
        <span className="w-14 shrink-0 font-mono text-xs font-semibold text-accent-text">
          {row.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>
        <span className="text-xs text-muted">
          {row.timeMs === null ? "—" : formatDuration(row.timeMs)}
        </span>
        <StatusPill tone={outcome.tone}>
          {row.status === null ? outcome.label : `${outcome.label} · ${row.status}`}
        </StatusPill>
      </div>
      {row.error && <p className="pl-[5.5rem] text-xs text-err">{row.error}</p>}
      {row.tests.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pl-[5.5rem]">
          {row.tests.map((test, index) => (
            <li
              key={index}
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                test.passed ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
              }`}
            >
              {test.passed ? "✓" : "✗"} {test.name}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function RunResults({ rows }: { rows: readonly RunRow[] }) {
  const summary = summarizeRun(rows);
  const totalTests = summary.passed + summary.failed;
  return (
    <>
      <p className="sr-only" data-testid="run-summary">
        {summary.requests} requests · {summary.passed} passed · {summary.failed} failed
        {summary.errors > 0 && ` · ${summary.errors} error(s)`}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests" value={summary.requests} />
        <Stat label="Tests passed" value={summary.passed} tone="text-ok" />
        <Stat label="Tests failed" value={summary.failed} tone={summary.failed ? "text-err" : ""} />
        <Stat label="Errors" value={summary.errors} tone={summary.errors ? "text-err" : ""} />
      </div>
      {totalTests > 0 && (
        <div
          role="img"
          aria-label={`${summary.passed} of ${totalTests} tests passed`}
          className="flex h-2 overflow-hidden rounded-full bg-err-soft"
        >
          <div className="bg-ok" style={{ width: `${(summary.passed / totalTests) * 100}%` }} />
        </div>
      )}
      <ol
        aria-label="Run results"
        className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface text-sm"
      >
        {rows.map((row, index) => (
          <RunRowItem key={index} row={row} />
        ))}
      </ol>
    </>
  );
}
