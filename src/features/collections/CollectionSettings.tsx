import { EmptyState, TextArea, TextInput } from "../../components/ui";
import type { Collection } from "../../lib/model";
import { buildScopes } from "../../lib/request-context";
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

  return (
    <div className="space-y-4 overflow-auto p-4">
      <TextInput
        aria-label="Collection name"
        className="w-full text-base font-medium"
        value={collection.name}
        onChange={(e) => update((c) => ({ ...c, name: e.target.value }))}
      />
      <TextArea
        aria-label="Description"
        className="h-20 w-full font-sans"
        placeholder="Description"
        value={collection.description}
        onChange={(e) => update((c) => ({ ...c, description: e.target.value }))}
      />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Variables</h3>
        <KeyValueEditor
          label="Collection variables"
          rows={collection.variables}
          onChange={(variables) => update((c) => ({ ...c, variables }))}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Authorization</h3>
        <p className="text-xs text-neutral-500">Requests and folders set to “Inherit” use this.</p>
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
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Scripts</h3>
        <p className="text-xs text-neutral-500">
          Run before / after every request in this collection.
        </p>
        <ScriptsEditor
          preRequestScript={collection.preRequestScript}
          testScript={collection.testScript}
          onChange={(scripts) => update((c) => ({ ...c, ...scripts }))}
        />
      </section>
    </div>
  );
}
