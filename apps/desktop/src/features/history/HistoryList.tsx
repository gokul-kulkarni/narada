import { Button, EmptyState } from "../../components/ui";
import { formatSentAt } from "@narada/core/delivery";
import { formatDuration } from "@narada/core/format";
import type { HistoryEntry } from "@narada/core/model";
import { newId } from "@narada/core/ids";
import { historySummary, requestAddress, requestBadge } from "../../protocols/registry";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { StatusPill } from "../delivery/StatusPill";

/** One sent request: click to open exactly what was sent in a new tab. */
export function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const summary = historySummary(entry);
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
        title={`${new Date(entry.sentAt).toLocaleString()} · open in a new tab`}
        onClick={() => {
          useTabsStore.getState().openRequest({ ...entry.request, id: newId() }, null);
          useUiStore.getState().show({ kind: "requests" });
        }}
      >
        <span className="w-14 shrink-0 font-mono text-xs font-semibold text-accent-text">
          {requestBadge(entry.request)}
        </span>
        <span className="min-w-0 truncate font-mono text-[13px]">
          {requestAddress(entry.request) || entry.request.name}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted">
          {entry.environment && `${entry.environment} · `}
          {formatSentAt(entry.sentAt)}
        </span>
        <StatusPill tone={summary.tone}>
          {summary.label}
          {summary.code !== "ERR" && ` · ${summary.code}`}
          {summary.timeMs !== null && ` · ${formatDuration(summary.timeMs)}`}
        </StatusPill>
      </button>
    </li>
  );
}

export function HistoryList() {
  const entries = useHistoryStore((s) => s.entries);
  if (entries.length === 0) return <EmptyState>No requests sent yet.</EmptyState>;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface text-sm">
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </ul>
      <Button variant="ghost" onClick={() => useHistoryStore.getState().clear()}>
        Clear history
      </Button>
    </div>
  );
}
