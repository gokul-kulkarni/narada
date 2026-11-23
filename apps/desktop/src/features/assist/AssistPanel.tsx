import { Button } from "../../components/ui";
import { useAssistStore, type AssistRun } from "../../state/assist-store";
import { useUiStore } from "../../state/ui-store";

function statusLine(run: AssistRun): string {
  switch (run.status) {
    case "running":
      return run.activity ?? (run.text ? "Writing…" : "Thinking…");
    case "done":
      return run.costUsd === null ? "Done" : `Done · $${run.costUsd.toFixed(2)}`;
    case "error":
      return "Failed";
    case "stopped":
      return "Stopped";
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    useUiStore.getState().notify("Answer copied.");
  } catch {
    useUiStore.getState().notify("Could not copy the answer.");
  }
}

/** The agent's answer about this tab's delivery, streamed in beside the response. */
export function AssistPanel({ tabId }: { tabId: string }) {
  const run = useAssistStore((s) => s.runs[tabId]);
  if (!run) return null;
  const { stop, dismiss } = useAssistStore.getState();

  return (
    <aside
      aria-label={`${run.agentName}'s answer`}
      className="flex w-[26rem] max-w-[45%] shrink-0 flex-col border-l border-line-soft bg-surface"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-line-soft px-4 py-2">
        <h2 className="shrink-0 text-sm font-semibold">{run.agentName}</h2>
        <span className="min-w-0 truncate text-xs text-muted" aria-live="polite">
          {statusLine(run)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {run.status === "running" && (
            <Button variant="ghost" onClick={() => stop(tabId)}>
              Stop
            </Button>
          )}
          {run.text !== "" && (
            <Button variant="ghost" onClick={() => void copy(run.text)}>
              Copy
            </Button>
          )}
          <Button variant="ghost" aria-label="Close answer" onClick={() => dismiss(tabId)}>
            ✕
          </Button>
        </span>
      </header>
      {run.error && (
        <div role="alert" className="mx-4 mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
          {run.error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
        {run.text}
      </div>
      <p className="shrink-0 border-t border-line-soft px-4 py-2 text-xs text-muted">
        Read-only: {run.agentName} can read and search files but cannot change them or run commands.
      </p>
    </aside>
  );
}
