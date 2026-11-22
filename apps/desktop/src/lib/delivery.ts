import type { HistoryEntry } from "./model";

export type DeliveryTone = "ok" | "err";

export interface DeliveryOutcome {
  readonly tone: DeliveryTone;
  readonly label: "Delivered" | "Returned" | "Not delivered";
}

/** How the delivery log words a response: it reached the server, came back with an error, or never arrived. */
export function deliveryOutcome(status: number | null): DeliveryOutcome {
  if (status === null) return { tone: "err", label: "Not delivered" };
  return status < 400 ? { tone: "ok", label: "Delivered" } : { tone: "err", label: "Returned" };
}

const LEADING_VARIABLE = /^\{\{[^}]+\}\}/;

/** The part of a URL worth showing in a log row: path and query, without the host or {{baseUrl}}. */
export function shortUrl(url: string): string {
  if (LEADING_VARIABLE.test(url)) return url.replace(LEADING_VARIABLE, "") || "/";
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname}${parsed.search}`;
    return rest === "/" ? `${parsed.host}/` : rest;
  } catch {
    return url;
  }
}

export const deliveriesFor = (
  entries: readonly HistoryEntry[],
  requestId: string,
): HistoryEntry[] => entries.filter((entry) => entry.request.id === requestId);

export function formatSentAt(iso: string, now: Date = new Date()): string {
  const sent = new Date(iso);
  if (Number.isNaN(sent.getTime())) return "";
  const time = sent.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sent.toDateString() === now.toDateString()
    ? time
    : `${sent.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
