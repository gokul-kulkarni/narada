import type { DeliveryTone } from "../lib/delivery";

/** How the delivery log words one delivery, whatever the protocol. */
export interface DeliverySummary {
  readonly tone: DeliveryTone;
  /** "Delivered", "Returned" or "Not delivered". */
  readonly label: string;
  /** Status, timing and size, e.g. "201 Created · 42 ms · 2 B". */
  readonly detail: string | null;
  /** A caveat worth a line of its own, e.g. a stream that was stopped. */
  readonly note: string | null;
}

/** The short form for compact rows (history, earlier deliveries). */
export interface ShortSummary {
  readonly tone: DeliveryTone;
  readonly label: string;
  /** e.g. "404" or "ERR". */
  readonly code: string;
  readonly timeMs: number | null;
}
