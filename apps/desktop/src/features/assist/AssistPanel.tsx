import { useState, type FormEvent } from "react";
import { Button, TextInput } from "../../components/ui";
import { useAssistStore, type AssistRun } from "../../state/assist-store";
import { useUiStore } from "../../state/ui-store";
import { AnswerMarkdown } from "./AnswerMarkdown";
import { askFollowUp } from "./ask";

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

function Question({ text }: { text: string }) {
  return <p className="my-3 ml-6 rounded-lg bg-surface-2 px-3 py-2 whitespace-pre-wrap">{text}</p>;
}

function FollowUp({ tabId }: { tabId: string }) {
  const [question, setQuestion] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    setQuestion("");
    void askFollowUp(tabId, question);
  };
  return (
    <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-line-soft px-4 py-2">
      <TextInput
        aria-label="Follow-up question"
        placeholder="Ask a follow-up…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="min-w-0 flex-1"
      />
      <Button type="submit" disabled={!question.trim()}>
        Ask
      </Button>
    </form>
  );
}

/** The agent's answers about this tab's delivery, streamed in beside the response. */
export function AssistPanel({ tabId }: { tabId: string }) {
  const run = useAssistStore((s) => s.runs[tabId]);
  if (!run) return null;
  const { stop, dismiss } = useAssistStore.getState();
  const canFollowUp = run.sessionId !== null && run.status !== "running";

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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1 text-sm leading-relaxed break-words">
        {run.earlier.map((exchange, index) => (
          <div key={index} className="border-b border-line-soft pb-2">
            {exchange.question !== null && <Question text={exchange.question} />}
            <AnswerMarkdown text={exchange.answer} />
          </div>
        ))}
        {run.question !== null && <Question text={run.question} />}
        <AnswerMarkdown text={run.text} />
        {run.error && (
          <div role="alert" className="my-3 rounded-lg bg-err-soft px-3 py-2 text-err">
            {run.error}
          </div>
        )}
      </div>
      {canFollowUp && <FollowUp tabId={tabId} />}
      <p className="shrink-0 border-t border-line-soft px-4 py-2 text-xs text-muted">
        Read-only: {run.agentName} can read and search{" "}
        {run.cwd ? <code className="font-mono break-all">{run.cwd}</code> : "only what it was told"}{" "}
        but cannot change files or run commands.
      </p>
    </aside>
  );
}
