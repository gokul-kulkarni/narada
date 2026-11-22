import { Button } from "../../components/ui";
import { HistoryList } from "../history/HistoryList";
import { useTabsStore } from "../../state/tabs-store";

/** Shown when no request is open: start a new one, or pick up something sent before. */
export function RecentDeliveries() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Where to next?</h2>
            <p className="mt-1 text-sm text-muted">
              Open a request from your collections, or start a new message.
            </p>
          </div>
          <Button variant="primary" onClick={() => useTabsStore.getState().openNew()}>
            New message
          </Button>
        </div>
        <section aria-label="History" className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-muted">Recent deliveries</h3>
          <HistoryList />
        </section>
      </div>
    </div>
  );
}
