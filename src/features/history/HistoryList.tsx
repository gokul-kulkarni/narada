import { Button, EmptyState } from "../../components/ui";
import { newId } from "../../lib/ids";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";

export function HistoryList() {
  const entries = useHistoryStore((s) => s.entries);
  if (entries.length === 0) return <EmptyState>No requests sent yet.</EmptyState>;

  return (
    <div className="space-y-1">
      <ul className="text-sm">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="flex w-full gap-2 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
              title={new Date(entry.sentAt).toLocaleString()}
              onClick={() =>
                useTabsStore.getState().openRequest({ ...entry.request, id: newId() }, null)
              }
            >
              <span className="w-12 shrink-0 text-xs font-semibold text-orange-600">
                {entry.request.method}
              </span>
              <span className="truncate">{entry.request.url || entry.request.name}</span>
              <span className="ml-auto text-xs text-neutral-500">{entry.status ?? "ERR"}</span>
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
