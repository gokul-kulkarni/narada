import { EmptyState, TextArea, TextInput } from "../../components/ui";
import type { Collection } from "../../lib/model";
import { useWorkspaceStore } from "../../state/workspace-store";
import { AuthEditor } from "../request/AuthEditor";
import { KeyValueEditor } from "../request/KeyValueEditor";

export function CollectionSettings({
  id,
  scriptsEditor,
}: {
  id: string;
  scriptsEditor?: (collection: Collection, update: (c: Collection) => void) => React.ReactNode;
}) {
  const collection = useWorkspaceStore((s) => s.collections.find((c) => c.id === id));
  if (!collection) return <EmptyState>This collection no longer exists.</EmptyState>;
  const update = (change: (c: Collection) => Collection) =>
    void useWorkspaceStore.getState().updateCollection(id, change);

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
          auth={collection.auth}
          allowInherit={false}
          onChange={(auth) => update((c) => ({ ...c, auth }))}
        />
      </section>
      {scriptsEditor && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Scripts</h3>
          {scriptsEditor(collection, (next) => update(() => next))}
        </section>
      )}
    </div>
  );
}
