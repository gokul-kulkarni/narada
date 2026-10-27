import { errorMessage } from "../../lib/format";
import { newId } from "../../lib/ids";
import type { HistoryEntry, HttpResponse } from "../../lib/model";
import {
  prepareRequest,
  type PrepareContext,
  type PreparedRequest,
} from "../../lib/prepare-request";
import type { RequestTab } from "../../state/tabs-store";

export interface SendDeps {
  readonly send: (request: PreparedRequest) => Promise<HttpResponse>;
  readonly getContext: (tab: RequestTab) => PrepareContext;
  readonly patchTab: (tabId: string, patch: Partial<Omit<RequestTab, "id">>) => void;
  readonly addHistory: (entry: HistoryEntry) => void;
  readonly now?: () => Date;
}

export async function sendTab(tab: RequestTab, deps: SendDeps): Promise<void> {
  const now = deps.now ?? (() => new Date());
  deps.patchTab(tab.id, { loading: true, error: null });
  try {
    const prepared = prepareRequest(tab.request, deps.getContext(tab));
    if (!prepared.url) throw new Error("Enter a URL to send the request.");
    const response = await deps.send(prepared);
    deps.patchTab(tab.id, { loading: false, response });
    deps.addHistory({
      id: newId(),
      sentAt: now().toISOString(),
      request: tab.request,
      status: response.status,
      timeMs: response.timeMs,
    });
  } catch (error) {
    const message = errorMessage(error);
    deps.patchTab(tab.id, { loading: false, response: null, error: message });
    deps.addHistory({
      id: newId(),
      sentAt: now().toISOString(),
      request: tab.request,
      status: null,
      timeMs: null,
    });
  }
}
