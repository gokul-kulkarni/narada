import { useRef, useState } from "react";
import { Button, EmptyState, TextInput } from "../../components/ui";
import { findFolder, findRequest, flattenRequests } from "../../lib/collection-tree";
import { parseDataFile, type DataRow } from "../../lib/data-file";
import { errorMessage, formatDuration } from "../../lib/format";
import { sendHttp } from "../../lib/http-client";
import { iterationCount, runCollection, summarizeRun, type RunRow } from "../../lib/runner";
import { executeScript } from "../../lib/scripts/script-runner";
import { useWorkspaceStore } from "../../state/workspace-store";
import { applyScopes, pipelineInputFor } from "../workspace/context";

export function RunnerView({
  collectionId,
  folderId,
}: {
  collectionId: string;
  folderId: string | null;
}) {
  const collection = useWorkspaceStore((s) => s.collections.find((c) => c.id === collectionId));
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [data, setData] = useState<{ name: string; rows: DataRow[] } | null>(null);
  const [rows, setRows] = useState<RunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  if (!collection) return <EmptyState>This collection no longer exists.</EmptyState>;
  const scopeItems = folderId
    ? (findFolder(collection.items, folderId)?.items ?? [])
    : collection.items;
  const requests = flattenRequests(scopeItems);
  const title = folderId
    ? `${collection.name} / ${findFolder(collection.items, folderId)?.name ?? ""}`
    : collection.name;

  const start = async () => {
    stopped.current = false;
    setRunning(true);
    setRows([]);
    setError(null);
    const base = pipelineInputFor(collection.id, null);
    try {
      const result = await runCollection(
        {
          steps: requests.map((request) => ({
            request,
            authChain: findRequest(collection, request.id)?.authChain ?? [collection.auth],
          })),
          iterations,
          data: data?.rows ?? [],
          scopes: base.scopes,
          collectionScripts: base.collectionScripts,
          delayMs,
          isStopped: () => stopped.current,
        },
        {
          send: sendHttp,
          execute: executeScript,
          onRow: (row) => setRows((current) => [...current, row]),
        },
      );
      await applyScopes(collection.id, base.scopes, result.scopes);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const summary = summarizeRun(rows);

  return (
    <div className="space-y-4 overflow-auto p-4">
      <h2 className="text-base font-medium">Run “{title}”</h2>
      <p className="text-sm text-muted">
        {requests.length} request(s) in order, using the active environment. Variable changes made
        by scripts are saved when the run finishes.
      </p>
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col">
          Iterations
          <TextInput
            aria-label="Iterations"
            type="number"
            min={1}
            className="w-24"
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col">
          Delay (ms)
          <TextInput
            aria-label="Delay"
            type="number"
            min={0}
            className="w-24"
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col">
          Data file (CSV/JSON)
          <input
            type="file"
            aria-label="Data file"
            accept=".csv,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return setData(null);
              try {
                setData({ name: file.name, rows: parseDataFile(await file.text(), file.name) });
                setError(null);
              } catch (err) {
                setError(`Could not read ${file.name}: ${errorMessage(err)}`);
              }
            }}
          />
        </label>
        {running ? (
          <Button variant="danger" onClick={() => (stopped.current = true)}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" disabled={requests.length === 0} onClick={() => void start()}>
            Run {iterationCount(iterations, data?.rows ?? [])} iteration(s)
          </Button>
        )}
      </div>
      {data && (
        <p className="text-xs text-muted">
          {data.name}: {data.rows.length} row(s)
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-err">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p className="text-sm" data-testid="run-summary">
            {summary.requests} requests · <span className="text-ok">{summary.passed} passed</span> ·{" "}
            <span className="text-err">{summary.failed} failed</span>
            {summary.errors > 0 && ` · ${summary.errors} error(s)`}
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted uppercase">
              <tr>
                <th>#</th>
                <th>Request</th>
                <th>Status</th>
                <th>Time</th>
                <th>Tests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-line-soft align-top">
                  <td className="py-1 pr-2">{row.iteration + 1}</td>
                  <td className="py-1 pr-2">
                    <span className="mr-1 text-xs font-semibold text-accent-text">
                      {row.method}
                    </span>
                    {row.name}
                    {row.error && <div className="text-xs text-err">{row.error}</div>}
                  </td>
                  <td className="py-1 pr-2">{row.status ?? "—"}</td>
                  <td className="py-1 pr-2">
                    {row.timeMs === null ? "—" : formatDuration(row.timeMs)}
                  </td>
                  <td className="py-1">
                    {row.tests.map((t, i) => (
                      <div key={i} className={t.passed ? "text-ok" : "text-err"}>
                        {t.passed ? "✓" : "✗"} {t.name}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
