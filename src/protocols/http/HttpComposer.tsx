import { Button } from "../../components/ui";
import type { HttpRequestDef } from "../../lib/model";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { OAuthTokenButton } from "../../features/request/OAuthTokenButton";
import { RequestEditor } from "../../features/request/RequestEditor";
import { ScriptsEditor } from "../../features/scripts/ScriptsEditor";
import { inputForTab } from "../../features/workspace/context";
import { saveTab } from "../../features/workspace/save-tab";

interface Props {
  readonly tab: RequestTab;
  readonly request: HttpRequestDef;
  readonly onSend: () => void;
}

const asHttp = (update: (r: HttpRequestDef) => HttpRequestDef) => (r: RequestTab["request"]) =>
  r.protocol === "http" ? update(r) : r;

/** Method, URL, params, headers, body, auth and scripts of an HTTP request. */
export function HttpComposer({ tab, request, onSend }: Props) {
  const update = (fn: (r: HttpRequestDef) => HttpRequestDef) =>
    useTabsStore.getState().updateRequest(tab.id, asHttp(fn));
  const { auth } = request;
  return (
    <RequestEditor
      key={tab.id}
      request={request}
      loading={tab.loading}
      onChange={update}
      onSend={onSend}
      toolbar={
        <>
          <Button onClick={() => useUiStore.getState().openDialog({ kind: "code", tabId: tab.id })}>
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
            onToken={(accessToken) => update((r) => ({ ...r, auth: { ...auth, accessToken } }))}
          />
        )
      }
      scriptsEditor={
        <ScriptsEditor
          preRequestScript={request.preRequestScript}
          testScript={request.testScript}
          onChange={(scripts) => update((r) => ({ ...r, ...scripts }))}
        />
      }
    />
  );
}
