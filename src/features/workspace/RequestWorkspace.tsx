import { useEffect } from "react";
import { Button, EmptyState } from "../../components/ui";
import { sendHttp } from "../../lib/http-client";
import { executeScript } from "../../lib/scripts/script-runner";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { OAuthTokenButton } from "../request/OAuthTokenButton";
import { RequestEditor } from "../request/RequestEditor";
import { sendTab } from "../request/send-request";
import { ResponseViewer } from "../response/ResponseViewer";
import { ScriptsEditor } from "../scripts/ScriptsEditor";
import { TestResults, testSummary } from "../scripts/TestResults";
import { TabBar } from "../tabs/TabBar";
import { applyScopes, inputForTab } from "./context";
import { saveTab } from "./save-tab";

function send(tab: RequestTab) {
  return sendTab(tab, {
    send: sendHttp,
    execute: executeScript,
    getInput: inputForTab,
    applyScopes: (t, before, after) => applyScopes(t.source?.collectionId ?? null, before, after),
    patchTab: useTabsStore.getState().patchTab,
    addHistory: useHistoryStore.getState().add,
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
  const { updateRequest } = useTabsStore.getState();
  useSaveShortcut();

  if (!tab) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TabBar />
        <EmptyState>Open or create a request to get started.</EmptyState>
      </div>
    );
  }

  const { auth } = tab.request;
  const ranScripts = tab.tests.length > 0 || tab.logs.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-neutral-200 dark:divide-neutral-800">
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
        <ResponseViewer
          response={tab.response}
          error={tab.error}
          loading={tab.loading}
          testResults={ranScripts ? <TestResults tests={tab.tests} logs={tab.logs} /> : undefined}
          testSummary={testSummary(tab.tests)}
        />
      </div>
    </div>
  );
}
