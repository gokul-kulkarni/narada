import type { ReactNode } from "react";
import { join } from "../../components/ui";
import type { DeliveryTone } from "../../lib/delivery";

const TONES: Record<DeliveryTone | "pending", string> = {
  ok: "bg-ok-soft text-ok",
  err: "bg-err-soft text-err",
  pending: "bg-accent-soft text-accent-soft-ink",
};

export function StatusPill({
  tone,
  children,
  testId,
}: {
  tone: DeliveryTone | "pending";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={join(
        "rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const DOTS: Record<DeliveryTone | "pending", string> = {
  ok: "bg-ok",
  err: "bg-err",
  pending: "bg-accent animate-pulse",
};

/** The marker on the delivery log's timeline line. */
export function TimelineDot({ tone }: { tone: DeliveryTone | "pending" }) {
  return (
    <span
      aria-hidden="true"
      className={join(
        "absolute top-4 -left-[33px] size-3.5 rounded-full border-[3px] border-canvas",
        DOTS[tone],
      )}
    />
  );
}
