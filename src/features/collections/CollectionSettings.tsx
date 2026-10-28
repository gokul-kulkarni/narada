import { Card, Page, TITLE_INPUT } from "../../components/page";
import { Button, EmptyState, TextArea, TextInput } from "../../components/ui";
import { flattenRequests } from "../../lib/collection-tree";
import type { Collection } from "../../lib/model";
import { buildScopes } from "../../lib/request-context";
import { useUiStore } from "../../state/ui-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { AuthEditor } from "../request/AuthEditor";
import { KeyValueEditor } from "../request/KeyValueEditor";
import { OAuthTokenButton } from "../request/OAuthTokenButton";
import { ScriptsEditor } from "../scripts/ScriptsEditor";

export function CollectionSettings({ id }: { id: string }) {
  const collection = useWorkspaceStore((s) => s.collections.find((c) => c.id === id));
  if (!collection) return <EmptyState>This collection no longer exists.</EmptyState>;
  const update = (change: (c: Collection) => Collection) =>
    void useWorkspaceStore.getState().updateCollection(id, change);
  const { auth } = collection;

  const scopes = () => {
    const workspace = useWorkspaceStore.getState();
    return buildScopes({
      requestId: null,
      collection,
      environment: selectActiveEnvironment(workspace),
      globals: workspace.globals,
    });
  };

  const requestCount = flattenRequests(collection.items).length;

  return (
    <Page
      eyebrow={`Collection · ${requestCount} ${requestCount === 1 ? "request" : "requests"}`}
      title={
        <TextInput
          aria-label="Collection name"
          className={TITLE_INPUT}
          value={collection.name}
          onChange={(e) => update((c) => ({ ...c, name: e.target.value }))}
        />
      }
      actions={
        <Button
          variant="primary"
          disabled={requestCount === 0}
          onClick={() =>
            useUiStore.getState().show({ kind: "runner", collectionId: id, folderId: null })
          }
        >
          Run collection
        </Button>
      }
    >
      <TextArea
        aria-label="Description"
        className="h-20 w-full font-sans"
        placeholder="What is this collection for?"
        value={collection.description}
        onChange={(e) => update((c) => ({ ...c, description: e.target.value }))}
      />
      <Card
        label="Variables"
        title="Variables"
        description="Shared by every request here. Environments override them."
      >
        <KeyValueEditor
          label="Collection variables"
          rows={collection.variables}
          onChange={(variables) => update((c) => ({ ...c, variables }))}
        />
      </Card>
      <Card
        label="Authorization"
        title="Authorization"
        description="Requests and folders set to “Inherit” use this."
      >
        <AuthEditor
          auth={auth}
          allowInherit={false}
          onChange={(next) => update((c) => ({ ...c, auth: next }))}
          oauthActions={
            auth.type === "oauth2" && (
              <OAuthTokenButton
                auth={auth}
                scopes={scopes()}
                onToken={(accessToken) => update((c) => ({ ...c, auth: { ...auth, accessToken } }))}
              />
            )
          }
        />
      </Card>
      <Card
        label="Scripts"
        title="Scripts"
        description="Run before / after every request in this collection."
      >
        <ScriptsEditor
          preRequestScript={collection.preRequestScript}
          testScript={collection.testScript}
          onChange={(scripts) => update((c) => ({ ...c, ...scripts }))}
        />
      </Card>
    </Page>
  );
}
