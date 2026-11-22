import type { TestResult } from "../../lib/scripts/types";

export const testSummary = (tests: readonly TestResult[]): string =>
  `Tests (${tests.filter((t) => t.passed).length}/${tests.length})`;

export function TestResults({
  tests,
  logs,
}: {
  tests: readonly TestResult[];
  logs: readonly string[];
}) {
  return (
    <div className="space-y-3 overflow-auto text-sm">
      {tests.length === 0 && <p className="text-muted">No tests ran.</p>}
      <ul className="space-y-1">
        {tests.map((test, index) => (
          <li key={`${test.name}-${index}`} className="flex gap-2">
            <span className={test.passed ? "text-ok" : "text-err"}>
              {test.passed ? "PASS" : "FAIL"}
            </span>
            <span>{test.name}</span>
            {test.error && <span className="text-muted">— {test.error}</span>}
          </li>
        ))}
      </ul>
      {logs.length > 0 && (
        <section aria-label="Console">
          <h4 className="text-xs font-semibold text-muted uppercase">Console</h4>
          <pre className="rounded bg-surface-2 p-2 text-xs whitespace-pre-wrap">
            {logs.join("\n")}
          </pre>
        </section>
      )}
    </div>
  );
}
