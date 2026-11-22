import type { ReactNode } from "react";
import { Button } from "../../components/ui";
import { formatSentAt } from "../../lib/delivery";
import { formatDuration } from "../../lib/format";
import type { Delivery, HistoryEntry, RequestDef } from "../../lib/model";
import {
  deliveryProgress,
  deliverySummary,
  historySummary,
  requestBadge,
  requestTarget,
} from "../../protocols/registry";
import { StatusPill, TimelineDot } from "./StatusPill";

const CARD = "rounded-2xl border border-line bg-surface";
const NOT_DELIVERED = { tone: "err", label: "Not delivered", detail: null, note: null } as const;

function Destination({
  request,
  environment,
  sentAt,
}: {
  request: RequestDef;
  environment?: string | null;
  sentAt?: string;
}) {
  const when = sentAt ? formatSentAt(sentAt) : "";
  return (
    <>
      <span className="min-w-0 truncate font-mono text-[13px]">
        <b>{requestBadge(request)}</b> {requestTarget(request)}
      </span>
      <span className="shrink-0 text-xs text-muted">
        {environment ? `→ ${environment}` : "→ no environment"}
        {when && ` · ${when}`}
      </span>
    </>
  );
}

/** The newest delivery of the open request, expanded with its full result. */
export function CurrentDelivery({
  request,
  environment,
  delivery,
  error,
  children,
}: {
  request: RequestDef;
  environment: string | null;
  delivery: Delivery | null;
  error: string | null;
  children?: ReactNode;
}) {
  const summary = delivery ? deliverySummary(delivery) : NOT_DELIVERED;
  return (
    <li className="relative">
      <TimelineDot tone={summary.tone} />
      <article aria-label="Latest delivery" className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Destination request={request} environment={environment} />
          <span className="ml-auto">
            <StatusPill tone={summary.tone} testId="response-status">
              {summary.label}
              {summary.detail && ` · ${summary.detail}`}
            </StatusPill>
          </span>
        </div>
        {summary.note && (
          <p className="mx-4 mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {summary.note}
          </p>
        )}
        {error && (
          <div role="alert" className="mx-4 mb-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
            {error}
          </div>
        )}
        {children && <div className="border-t border-line-soft">{children}</div>}
      </article>
    </li>
  );
}

/** A delivery in flight; once the reply starts arriving it shows what came so far. */
export function PendingDelivery({
  request,
  environment,
  partial,
  onStop,
  children,
}: {
  request: RequestDef;
  environment: string | null;
  partial: Delivery | null;
  onStop?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <TimelineDot tone="pending" />
      <article aria-label="Dispatching" aria-busy="true" className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Destination request={request} environment={environment} />
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <StatusPill tone="pending" testId="delivery-progress">
              {partial ? deliveryProgress(partial) : "Dispatching…"}
            </StatusPill>
            {onStop && (
              <Button variant="ghost" onClick={onStop}>
                Stop
              </Button>
            )}
          </span>
        </div>
        {children && <div className="border-t border-line-soft">{children}</div>}
      </article>
    </li>
  );
}

/** An earlier delivery: one line, click to open that exact request in a new tab. */
export function PastDelivery({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const summary = historySummary(entry);
  return (
    <li className="relative">
      <TimelineDot tone={summary.tone} />
      <button
        type="button"
        title="Open this version in a new tab"
        onClick={onOpen}
        className={`${CARD} flex w-full items-center gap-3 px-4 py-3 text-left hover:border-accent`}
      >
        <Destination
          request={entry.request}
          environment={entry.environment}
          sentAt={entry.sentAt}
        />
        <span className="ml-auto">
          <StatusPill tone={summary.tone}>
            {summary.label}
            {summary.code !== "ERR" && ` · ${summary.code}`}
            {summary.timeMs !== null && ` · ${formatDuration(summary.timeMs)}`}
          </StatusPill>
        </span>
      </button>
    </li>
  );
}
