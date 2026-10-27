import { useEffect } from "react";
import { Button, EmptyState } from "../../components/ui";
import { sendHttp } from "../../lib/http-client";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { RequestEditor } from "../request/RequestEditor";
import { sendTab } from "../request/send-request";
import { ResponseViewer } from "../response/ResponseViewer";
import { TabBar } from "../tabs/TabBar";
import { contextForTab } from "./context";
import { saveTab } from "./save-tab";

export function RequestWorkspace() {
  const tab = useTabsStore(selectActiveTab);
  const { updateRequest, patchTab } = useTabsStore.getState();

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      {tab ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-neutral-200 dark:divide-neutral-800">
          <RequestEditor
            key={tab.id}
            request={tab.request}
            loading={tab.loading}
            onChange={(update) => updateRequest(tab.id, update)}
            onSend={() =>
              sendTab(tab, {
                send: sendHttp,
                getContext: contextForTab,
                patchTab,
                addHistory: useHistoryStore.getState().add,
              })
            }
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
          />
          <ResponseViewer response={tab.response} error={tab.error} loading={tab.loading} />
        </div>
      ) : (
        <EmptyState>Open or create a request to get started.</EmptyState>
      )}
    </div>
  );
}
