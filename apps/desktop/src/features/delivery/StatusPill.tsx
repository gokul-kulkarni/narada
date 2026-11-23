import type { ReactNode } from "react";
import { join } from "../../components/ui";
import type { DeliveryTone } from "@narada/core/delivery";

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
