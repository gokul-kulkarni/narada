import { useState } from "react";
import { deliveriesFor } from "@narada/core/delivery";
import { Button, TabStrip } from "../../components/ui";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { formatKeys } from "../shortcuts/keys";
import { HistoryRow } from "./HistoryList";

type Scope = "request" | "all";

/** The panel the status bar's History button opens: what was sent, newest first. */
export function HistoryPanel() {
  const open = useUiStore((s) => s.historyOpen);
  const entries = useHistoryStore((s) => s.entries);
  const tab = useTabsStore(selectActiveTab);
  const onRequests = useUiStore((s) => s.view.kind === "requests");
  const [chosen, setScope] = useState<Scope>("request");
  if (!open) return null;

  // "This request" only means something while a request is on screen.
  const request = onRequests ? tab?.request : undefined;
  const scope = request ? chosen : "all";
  const mine = request ? deliveriesFor(entries, request.id) : [];
  const shown = scope === "request" ? mine : entries;
  const scopes: { id: Scope; label: string }[] = [
    ...(request ? [{ id: "request" as const, label: `This request (${mine.length})` }] : []),
    { id: "all", label: `All (${entries.length})` },
  ];

  return (
    <section
      aria-label="History"
      className="flex h-64 shrink-0 flex-col border-t border-line bg-surface"
    >
      <header className="flex items-center gap-4 border-b border-line-soft px-4 py-1.5">
        <h2 className="text-xs font-bold text-muted">History</h2>
        <TabStrip label="Which history" tabs={scopes} active={scope} onChange={setScope} />
        <span className="ml-auto flex items-center gap-1">
          {entries.length > 0 && (
            <Button variant="ghost" onClick={() => useHistoryStore.getState().clear()}>
              Clear
            </Button>
          )}
          <button
            type="button"
            aria-label="Close history"
            title={`Close (${formatKeys("mod+j")})`}
            onClick={() => useUiStore.getState().toggleHistory()}
            className="rounded px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </span>
      </header>
      {shown.length === 0 ? (
        <p className="m-auto text-sm text-muted">
          {scope === "request" ? "This request has not been sent yet." : "No requests sent yet."}
        </p>
      ) : (
        <ol
          aria-label="Sent requests"
          className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto text-sm"
        >
          {shown.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}
