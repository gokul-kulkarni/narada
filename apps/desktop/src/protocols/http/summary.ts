import { deliveryOutcome, shortUrl } from "../../lib/delivery";
import { formatBytes, formatDuration } from "../../lib/format";
import type { HistoryEntry, HttpDelivery, HttpRequestDef } from "../../lib/model";
import type { DeliverySummary, ShortSummary } from "../types";

export const httpBadge = (request: HttpRequestDef) => request.method;

/** Path and query, without the host or a leading {{baseUrl}}. */
export const httpTarget = (request: HttpRequestDef) => shortUrl(request.url);

export const httpAddress = (request: HttpRequestDef) => request.url;

const statusLine = (status: number, statusText: string) => `${status} ${statusText}`.trim();

export function httpSummary({ response }: HttpDelivery): DeliverySummary {
  const { tone, label } = deliveryOutcome(response.status);
  return {
    tone,
    label,
    detail: `${statusLine(response.status, response.statusText)} · ${formatDuration(response.timeMs)} · ${formatBytes(response.sizeBytes)}`,
    note: response.incomplete ?? null,
  };
}

/** While the reply is still arriving. */
export const httpProgress = ({ response }: HttpDelivery) =>
  `Receiving · ${statusLine(response.status, response.statusText)} · ${formatBytes(response.sizeBytes)}`;

export function httpShortSummary(entry: HistoryEntry): ShortSummary {
  const { tone, label } = deliveryOutcome(entry.status);
  return {
    tone,
    label,
    code: entry.status === null ? "ERR" : String(entry.status),
    timeMs: entry.timeMs,
  };
}
