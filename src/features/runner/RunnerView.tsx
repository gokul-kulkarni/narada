import { useRef, useState } from "react";
import { Card, ErrorText, Page, PAGE_TITLE } from "../../components/page";
import { Button, EmptyState, TextInput } from "../../components/ui";
import { findFolder, findRequest, flattenRequests } from "../../lib/collection-tree";
import { parseDataFile, type DataRow } from "../../lib/data-file";
import { errorMessage } from "../../lib/format";
import { sendHttp } from "../../lib/http-client";
import { iterationCount, runCollection, type RunRow } from "../../lib/runner";
import { executeScript } from "../../lib/scripts/script-runner";
import { useWorkspaceStore } from "../../state/workspace-store";
import { applyScopes, pipelineInputFor } from "../workspace/context";
import { RunResults } from "./RunResults";

const FIELD_LABEL = "flex flex-col gap-1 text-xs font-bold text-muted";

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

  const runButton = running ? (
    <Button variant="danger" onClick={() => (stopped.current = true)}>
      Stop
    </Button>
  ) : (
    <Button variant="primary" disabled={requests.length === 0} onClick={() => void start()}>
      Run {iterationCount(iterations, data?.rows ?? [])} iteration(s)
    </Button>
  );

  return (
    <Page
      eyebrow={`Collection run · ${requests.length} request(s) in order`}
      title={<h2 className={PAGE_TITLE}>Run “{title}”</h2>}
      actions={runButton}
    >
      <Card
        label="Run options"
        description="Uses the active environment. Variable changes made by scripts are saved when the run finishes."
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className={FIELD_LABEL}>
            Iterations
            <TextInput
              aria-label="Iterations"
              type="number"
              min={1}
              className="w-28 font-normal text-ink"
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
            />
          </label>
          <label className={FIELD_LABEL}>
            Delay between requests (ms)
            <TextInput
              aria-label="Delay"
              type="number"
              min={0}
              className="w-28 font-normal text-ink"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
            />
          </label>
          <label className={FIELD_LABEL}>
            Data file (CSV or JSON, one iteration per row)
            <input
              type="file"
              aria-label="Data file"
              accept=".csv,.json"
              className="text-sm font-normal text-ink file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:font-semibold file:text-ink"
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
        </div>
        {data && (
          <p className="text-xs text-muted">
            {data.name}: {data.rows.length} row(s)
          </p>
        )}
      </Card>
      {error && <ErrorText>{error}</ErrorText>}
      {rows.length > 0 ? (
        <RunResults rows={rows} />
      ) : (
        !running && (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
            Results appear here as each request comes back.
          </p>
        )
      )}
    </Page>
  );
}
