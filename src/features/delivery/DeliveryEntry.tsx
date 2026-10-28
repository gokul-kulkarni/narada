import type { ReactNode } from "react";
import { Button } from "../../components/ui";
import { deliveryOutcome, formatSentAt, shortUrl } from "../../lib/delivery";
import { formatBytes, formatDuration } from "../../lib/format";
import type { HistoryEntry, HttpResponse, RequestDef } from "../../lib/model";
import { StatusPill, TimelineDot } from "./StatusPill";

const CARD = "rounded-2xl border border-line bg-surface";

function Destination({
  request,
  environment,
  sentAt,
}: {
  request: Pick<RequestDef, "method" | "url">;
  environment?: string | null;
  sentAt?: string;
}) {
  const when = sentAt ? formatSentAt(sentAt) : "";
  return (
    <>
      <span className="min-w-0 truncate font-mono text-[13px]">
        <b>{request.method}</b> {shortUrl(request.url)}
      </span>
      <span className="shrink-0 text-xs text-muted">
        {environment ? `→ ${environment}` : "→ no environment"}
        {when && ` · ${when}`}
      </span>
    </>
  );
}

const responseSummary = (response: HttpResponse) =>
  `${`${response.status} ${response.statusText}`.trim()} · ${formatDuration(response.timeMs)} · ${formatBytes(response.sizeBytes)}`;

/** The newest delivery of the open request, expanded with its full response. */
export function CurrentDelivery({
  request,
  environment,
  response,
  error,
  children,
}: {
  request: RequestDef;
  environment: string | null;
  response: HttpResponse | null;
  error: string | null;
  children?: ReactNode;
}) {
  const outcome = deliveryOutcome(response?.status ?? null);
  return (
    <li className="relative">
      <TimelineDot tone={outcome.tone} />
      <article aria-label="Latest delivery" className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Destination request={request} environment={environment} />
          <span className="ml-auto">
            <StatusPill tone={outcome.tone} testId="response-status">
              {outcome.label}
              {response && ` · ${responseSummary(response)}`}
            </StatusPill>
          </span>
        </div>
        {response?.incomplete && (
          <p className="mx-4 mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {response.incomplete}
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
  partial: HttpResponse | null;
  onStop?: () => void;
  children?: ReactNode;
}) {
  const status = partial && `${partial.status} ${partial.statusText}`.trim();
  return (
    <li className="relative">
      <TimelineDot tone="pending" />
      <article aria-label="Dispatching" aria-busy="true" className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Destination request={request} environment={environment} />
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <StatusPill tone="pending" testId="delivery-progress">
              {partial
                ? `Receiving · ${status} · ${formatBytes(partial.sizeBytes)}`
                : "Dispatching…"}
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
  const outcome = deliveryOutcome(entry.status);
  return (
    <li className="relative">
      <TimelineDot tone={outcome.tone} />
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
          <StatusPill tone={outcome.tone}>
            {outcome.label}
            {entry.status !== null && ` · ${entry.status}`}
            {entry.timeMs !== null && ` · ${formatDuration(entry.timeMs)}`}
          </StatusPill>
        </span>
      </button>
    </li>
  );
}
