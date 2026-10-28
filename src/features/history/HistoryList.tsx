import { Button, EmptyState } from "../../components/ui";
import { deliveryOutcome, formatSentAt } from "../../lib/delivery";
import { newId } from "../../lib/ids";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";
import { StatusPill } from "../delivery/StatusPill";

export function HistoryList() {
  const entries = useHistoryStore((s) => s.entries);
  if (entries.length === 0) return <EmptyState>No requests sent yet.</EmptyState>;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface text-sm">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
              title={new Date(entry.sentAt).toLocaleString()}
              onClick={() =>
                useTabsStore.getState().openRequest({ ...entry.request, id: newId() }, null)
              }
            >
              <span className="w-14 shrink-0 font-mono text-xs font-semibold text-accent-text">
                {entry.request.method}
              </span>
              <span className="min-w-0 truncate font-mono text-[13px]">
                {entry.request.url || entry.request.name}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted">
                {entry.environment && `${entry.environment} · `}
                {formatSentAt(entry.sentAt)}
              </span>
              <StatusPill tone={deliveryOutcome(entry.status).tone}>
                {entry.status ?? "ERR"}
              </StatusPill>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={() => useHistoryStore.getState().clear()}>
        Clear history
      </Button>
    </div>
  );
}
