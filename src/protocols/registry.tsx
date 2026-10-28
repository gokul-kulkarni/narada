/**
 * The one place that knows every protocol. Generic UI (tabs, history, the delivery log)
 * asks these functions instead of reading protocol fields, so adding a protocol means
 * adding a module under src/protocols and a case to each switch below.
 */
import type { Delivery, HistoryEntry, RequestDef } from "../lib/model";
import type { RequestTab } from "../state/tabs-store";
import { dispatchHttp } from "./http/dispatch";
import { HttpComposer } from "./http/HttpComposer";
import { HttpResult } from "./http/HttpResult";
import {
  httpAddress,
  httpBadge,
  httpProgress,
  httpShortSummary,
  httpSummary,
  httpTarget,
} from "./http/summary";
import type { DeliverySummary, ShortSummary } from "./types";

/** The short tag shown before a request's name, e.g. "GET". */
export function requestBadge(request: RequestDef): string {
  switch (request.protocol) {
    case "http":
      return httpBadge(request);
  }
}

/** Where the request goes, shortened for log rows. */
export function requestTarget(request: RequestDef): string {
  switch (request.protocol) {
    case "http":
      return httpTarget(request);
  }
}

/** Where the request goes, in full. */
export function requestAddress(request: RequestDef): string {
  switch (request.protocol) {
    case "http":
      return httpAddress(request);
  }
}

export function deliverySummary(delivery: Delivery): DeliverySummary {
  switch (delivery.protocol) {
    case "http":
      return httpSummary(delivery);
  }
}

export function deliveryProgress(partial: Delivery): string {
  switch (partial.protocol) {
    case "http":
      return httpProgress(partial);
  }
}

export function historySummary(entry: HistoryEntry): ShortSummary {
  switch (entry.request.protocol) {
    case "http":
      return httpShortSummary(entry);
  }
}

export function dispatchTab(tab: RequestTab): Promise<void> {
  switch (tab.request.protocol) {
    case "http":
      return dispatchHttp(tab, tab.request);
  }
}

export function Composer({ tab }: { readonly tab: RequestTab }) {
  const onSend = () => void dispatchTab(tab);
  switch (tab.request.protocol) {
    case "http":
      return <HttpComposer tab={tab} request={tab.request} onSend={onSend} />;
  }
}

export function DeliveryView({
  tab,
  delivery,
  live,
}: {
  readonly tab: RequestTab;
  readonly delivery: Delivery;
  readonly live?: boolean;
}) {
  switch (delivery.protocol) {
    case "http":
      return <HttpResult tab={tab} delivery={delivery} live={live} />;
  }
}
