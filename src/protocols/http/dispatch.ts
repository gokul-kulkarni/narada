import { sendHttp } from "../../lib/http-client";
import type { HttpRequestDef, HttpResponse } from "../../lib/model";
import { executeScript } from "../../lib/scripts/script-runner";
import { throttle } from "../../lib/throttle";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { beginDelivery, endDelivery } from "../../features/request/in-flight";
import { sendTab } from "../../features/request/send-request";
import { applyScopes, inputForTab } from "../../features/workspace/context";

/** How often a streaming response repaints; often enough to look live, cheap on long streams. */
const PROGRESS_INTERVAL_MS = 50;

const activeEnvironmentName = () =>
  selectActiveEnvironment(useWorkspaceStore.getState())?.name ?? null;

/** Sends an HTTP tab through scripts, variables and history, showing the reply as it streams. */
export function dispatchHttp(tab: RequestTab, request: HttpRequestDef): Promise<void> {
  const signal = beginDelivery(tab.id);
  const showPartial = throttle((response: HttpResponse) => {
    const { tabs, patchTab } = useTabsStore.getState();
    if (tabs.find((t) => t.id === tab.id)?.loading) {
      patchTab(tab.id, { partial: { protocol: "http", response } });
    }
  }, PROGRESS_INTERVAL_MS);
  const delivered = sendTab(tab, request, {
    send: (prepared) => sendHttp(prepared, { signal, onProgress: showPartial }),
    execute: executeScript,
    getInput: inputForTab,
    applyScopes: (t, before, after) => applyScopes(t.source?.collectionId ?? null, before, after),
    patchTab: useTabsStore.getState().patchTab,
    addHistory: (entry) =>
      useHistoryStore.getState().add({ ...entry, environment: activeEnvironmentName() }),
  });
  return delivered.finally(() => {
    showPartial.cancel();
    endDelivery(tab.id, signal);
  });
}
