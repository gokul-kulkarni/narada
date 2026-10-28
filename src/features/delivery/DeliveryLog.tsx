import type { ReactNode } from "react";
import { deliveriesFor } from "../../lib/delivery";
import { newId } from "../../lib/ids";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { CurrentDelivery, PastDelivery, PendingDelivery } from "./DeliveryEntry";

export const PAST_DELIVERY_LIMIT = 8;

interface Props {
  readonly tab: RequestTab;
  /** The active environment, used for a delivery in flight. */
  readonly environment: string | null;
  /** The response body/headers/tests view for the newest delivery. */
  readonly responseView?: ReactNode;
  /** The view of a response still arriving. */
  readonly liveView?: ReactNode;
  readonly onStop?: () => void;
}

/** Every time the open request was sent, newest first, on a timeline. */
export function DeliveryLog({ tab, environment, responseView, liveView, onStop }: Props) {
  const entries = useHistoryStore((s) => s.entries);
  const hasCurrent = !tab.loading && (tab.response !== null || tab.error !== null);
  // When a response is showing, the newest history entry is that same delivery.
  const all = deliveriesFor(entries, tab.request.id);
  const past = all.slice(hasCurrent ? 1 : 0);
  // The newest entry remembers where it went, even if the environment was switched since.
  const sentTo = hasCurrent && all[0] ? (all[0].environment ?? null) : environment;
  const shown = past.slice(0, PAST_DELIVERY_LIMIT);
  const hidden = past.length - shown.length;
  const reopen = (index: number) =>
    useTabsStore.getState().openRequest({ ...shown[index].request, id: newId() }, null);

  if (!tab.loading && !hasCurrent && past.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
        Nothing dispatched yet. Every time you send this request, the delivery and its reply are
        logged here.
      </p>
    );
  }

  return (
    <ol aria-label="Delivery log" className="ml-3 flex flex-col gap-4 border-l-2 border-line pl-6">
      {tab.loading && (
        <PendingDelivery
          request={tab.request}
          environment={environment}
          partial={tab.partial}
          onStop={onStop}
        >
          {tab.partial && liveView}
        </PendingDelivery>
      )}
      {hasCurrent && (
        <CurrentDelivery
          request={tab.request}
          environment={sentTo}
          response={tab.response}
          error={tab.error}
        >
          {tab.response && responseView}
        </CurrentDelivery>
      )}
      {shown.map((entry, index) => (
        <PastDelivery key={entry.id} entry={entry} onOpen={() => reopen(index)} />
      ))}
      {hidden > 0 && (
        <li className="text-xs text-muted">
          {hidden} earlier {hidden === 1 ? "delivery" : "deliveries"} in Recent deliveries
        </li>
      )}
    </ol>
  );
}
