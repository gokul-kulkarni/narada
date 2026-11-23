import type { ReactNode } from "react";
import { Button } from "../../components/ui";
import { deliveriesFor } from "@narada/core/delivery";
import { useHistoryStore } from "../../state/history-store";
import type { RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { CurrentDelivery, PendingDelivery } from "./DeliveryEntry";

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

/** The open request's latest delivery. Earlier ones are in the History panel. */
export function DeliveryLog({ tab, environment, responseView, liveView, onStop }: Props) {
  const entries = useHistoryStore((s) => s.entries);
  const hasCurrent = !tab.loading && (tab.delivery !== null || tab.error !== null);
  const all = deliveriesFor(entries, tab.request.id);
  // The newest entry remembers where it went, even if the environment was switched since.
  const sentTo = hasCurrent && all[0] ? (all[0].environment ?? null) : environment;

  if (tab.loading) {
    return (
      <PendingDelivery
        request={tab.request}
        environment={environment}
        partial={tab.partial}
        onStop={onStop}
      >
        {tab.partial && liveView}
      </PendingDelivery>
    );
  }
  if (hasCurrent) {
    return (
      <CurrentDelivery
        request={tab.request}
        environment={sentTo}
        delivery={tab.delivery}
        error={tab.error}
      >
        {tab.delivery && responseView}
      </CurrentDelivery>
    );
  }
  return (
    <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center text-sm text-muted">
      <p>
        {all.length > 0
          ? `Sent ${all.length === 1 ? "once" : `${all.length} times`} before. Dispatch it to see a response here.`
          : "Nothing dispatched yet. Dispatch the request to see its response here."}
      </p>
      {all.length > 0 && (
        <Button
          variant="ghost"
          onClick={() => {
            if (!useUiStore.getState().historyOpen) useUiStore.getState().toggleHistory();
          }}
        >
          Show history
        </Button>
      )}
    </div>
  );
}
