import { EmptyState } from "../../components/ui";
import { sendHttp } from "../../lib/http-client";
import { useHistoryStore } from "../../state/history-store";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { RequestEditor } from "../request/RequestEditor";
import { sendTab } from "../request/send-request";
import { ResponseViewer } from "../response/ResponseViewer";
import { TabBar } from "../tabs/TabBar";

const EMPTY_CONTEXT = {
  scopes: { global: {}, collection: {}, environment: {}, data: {}, local: {} },
  authChain: [],
};

export function RequestWorkspace() {
  const tab = useTabsStore(selectActiveTab);
  const { updateRequest, patchTab } = useTabsStore.getState();

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
                getContext: () => EMPTY_CONTEXT,
                patchTab,
                addHistory: useHistoryStore.getState().add,
              })
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
