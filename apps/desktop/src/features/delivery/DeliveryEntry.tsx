import type { ReactNode } from "react";
import { Button } from "../../components/ui";
import type { Delivery, RequestDef } from "@narada/core/model";
import {
  deliveryProgress,
  deliverySummary,
  requestBadge,
  requestTarget,
} from "../../protocols/registry";
import { StatusPill } from "./StatusPill";

const NOT_DELIVERED = { tone: "err", label: "Not delivered", detail: null, note: null } as const;

function Destination({
  request,
  environment,
}: {
  request: RequestDef;
  environment?: string | null;
}) {
  return (
    <>
      <span className="min-w-0 truncate font-mono text-[13px]">
        <b>{requestBadge(request)}</b> {requestTarget(request)}
      </span>
      <span className="shrink-0 text-xs text-muted">
        {environment ? `→ ${environment}` : "→ no environment"}
      </span>
    </>
  );
}

/** The header strip of the delivery on screen: where it went, then its status. */
function Header({ children }: { children: ReactNode }) {
  return (
    // Wraps rather than squeezing the destination away when space is tight (e.g. an agent's
    // answer is open beside the response).
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft bg-surface px-5 py-2">
      {children}
    </div>
  );
}

/** The body of the delivery on screen, filling the space left under the header. */
function Body({ children }: { children?: ReactNode }) {
  return children ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : null;
}

/** The newest delivery of the open request, with its full result. */
export function CurrentDelivery({
  request,
  environment,
  delivery,
  error,
  actions,
  children,
}: {
  request: RequestDef;
  environment: string | null;
  delivery: Delivery | null;
  error: string | null;
  /** Buttons shown before the status, e.g. "Ask Claude Code". */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const summary = delivery ? deliverySummary(delivery) : NOT_DELIVERED;
  return (
    <article aria-label="Latest delivery" className="flex min-h-0 flex-1 flex-col">
      <Header>
        <Destination request={request} environment={environment} />
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          <StatusPill tone={summary.tone} testId="response-status">
            {summary.label}
            {summary.detail && ` · ${summary.detail}`}
          </StatusPill>
        </span>
      </Header>
      {summary.note && (
        <p className="mx-5 mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {summary.note}
        </p>
      )}
      {error && (
        <div role="alert" className="mx-5 mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
          {error}
        </div>
      )}
      <Body>{children}</Body>
    </article>
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
    <article aria-label="Dispatching" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
      <Header>
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
      </Header>
      <Body>{children}</Body>
    </article>
  );
}
