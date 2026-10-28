import { useEffect } from "react";
import { Button } from "../../components/ui";
import { sendHttp } from "../../lib/http-client";
import type { HttpResponse } from "../../lib/model";
import { throttle } from "../../lib/throttle";
import { executeScript } from "../../lib/scripts/script-runner";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { DeliveryLog } from "../delivery/DeliveryLog";
import { RecentDeliveries } from "../delivery/RecentDeliveries";
import { beginDelivery, endDelivery, stopDelivery } from "../request/in-flight";
import { OAuthTokenButton } from "../request/OAuthTokenButton";
import { RequestEditor } from "../request/RequestEditor";
import { sendTab } from "../request/send-request";
import { ResponseViewer } from "../response/ResponseViewer";
import { ScriptsEditor } from "../scripts/ScriptsEditor";
import { TestResults, testSummary } from "../scripts/TestResults";
import { TabBar } from "../tabs/TabBar";
import { applyScopes, inputForTab } from "./context";
import { saveTab } from "./save-tab";

const activeEnvironmentName = () =>
  selectActiveEnvironment(useWorkspaceStore.getState())?.name ?? null;

/** How often a streaming response repaints; often enough to look live, cheap on long streams. */
const PROGRESS_INTERVAL_MS = 50;

function send(tab: RequestTab) {
  const signal = beginDelivery(tab.id);
  const showPartial = throttle((partial: HttpResponse) => {
    const { tabs, patchTab } = useTabsStore.getState();
    if (tabs.find((t) => t.id === tab.id)?.loading) patchTab(tab.id, { partial });
  }, PROGRESS_INTERVAL_MS);
  const delivered = sendTab(tab, {
    send: (request) => sendHttp(request, { signal, onProgress: showPartial }),
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

function useSaveShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const active = selectActiveTab(useTabsStore.getState());
        if (active) void saveTab(active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function RequestWorkspace() {
  const tab = useTabsStore(selectActiveTab);
  const environment = useWorkspaceStore((s) => selectActiveEnvironment(s)?.name ?? null);
  const { updateRequest } = useTabsStore.getState();
  useSaveShortcut();

  if (!tab) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TabBar />
        <RecentDeliveries />
      </div>
    );
  }

  const { auth } = tab.request;
  const ranScripts = tab.tests.length > 0 || tab.logs.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-6">
          <RequestEditor
            key={tab.id}
            request={tab.request}
            loading={tab.loading}
            onChange={(update) => updateRequest(tab.id, update)}
            onSend={() => void send(tab)}
            toolbar={
              <>
                <Button
                  onClick={() => useUiStore.getState().openDialog({ kind: "code", tabId: tab.id })}
                >
                  Code
                </Button>
                <Button onClick={() => void saveTab(tab)}>Save</Button>
              </>
            }
            oauthActions={
              auth.type === "oauth2" && (
                <OAuthTokenButton
                  auth={auth}
                  scopes={inputForTab(tab).scopes}
                  onToken={(accessToken) =>
                    updateRequest(tab.id, (r) => ({ ...r, auth: { ...auth, accessToken } }))
                  }
                />
              )
            }
            scriptsEditor={
              <ScriptsEditor
                preRequestScript={tab.request.preRequestScript}
                testScript={tab.request.testScript}
                onChange={(scripts) => updateRequest(tab.id, (r) => ({ ...r, ...scripts }))}
              />
            }
          />
          <DeliveryLog
            tab={tab}
            environment={environment}
            onStop={() => stopDelivery(tab.id)}
            liveView={tab.partial && <ResponseViewer key={tab.id} response={tab.partial} live />}
            responseView={
              tab.response && (
                <ResponseViewer
                  key={tab.id}
                  response={tab.response}
                  testResults={
                    ranScripts ? <TestResults tests={tab.tests} logs={tab.logs} /> : undefined
                  }
                  testSummary={testSummary(tab.tests)}
                />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
