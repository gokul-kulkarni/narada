import { useState } from "react";
import { InlineRename } from "../../components/InlineRename";
import { Button, EmptyState } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { exportTextFile, safeExportName } from "../../lib/export-file";
import type { Collection } from "../../lib/model";
import { toPostmanCollection } from "../../lib/postman/collection";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { addFolder, addRequest } from "./collection-actions";
import { ItemActions } from "./ItemActions";
import { TreeItems } from "./CollectionTree";

async function exportCollection(collection: Collection) {
  try {
    const content = JSON.stringify(toPostmanCollection(collection), null, 2);
    if (
      await exportTextFile(safeExportName(collection.name, ".postman_collection.json"), content)
    ) {
      useUiStore.getState().notify(`Exported "${collection.name}".`);
    }
  } catch (error) {
    useUiStore.getState().notify(`Export failed: ${errorMessage(error)}`);
  }
}

function CollectionNode({ collection }: { collection: Collection }) {
  const revealed = useUiStore((s) => s.revealed.has(collection.id));
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? revealed;
  const [renaming, setRenaming] = useState(false);
  const { updateCollection, deleteCollection } = useWorkspaceStore.getState();
  const { show } = useUiStore.getState();

  return (
    <li>
      <div className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-900">
        {renaming ? (
          <InlineRename
            value={collection.name}
            onCommit={(name) => {
              void updateCollection(collection.id, (c) => ({ ...c, name }));
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            aria-expanded={open}
            className="flex min-w-0 flex-1 gap-1 text-left font-medium"
            onClick={() => setOpen(!open)}
          >
            <span className="w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
            <span className="truncate">{collection.name}</span>
          </button>
        )}
        <ItemActions
          name={collection.name}
          actions={[
            {
              label: "Add request",
              onSelect: () => (setOpen(true), addRequest(collection.id, null)),
            },
            {
              label: "Add folder",
              onSelect: () => (setOpen(true), addFolder(collection.id, null)),
            },
            {
              label: "Run collection",
              onSelect: () => show({ kind: "runner", collectionId: collection.id, folderId: null }),
            },
            { label: "Settings", onSelect: () => show({ kind: "collection", id: collection.id }) },
            { label: "Rename", onSelect: () => setRenaming(true) },
            { label: "Export", onSelect: () => void exportCollection(collection) },
            { label: "Delete", danger: true, onSelect: () => void deleteCollection(collection.id) },
          ]}
        />
      </div>
      {open &&
        (collection.items.length > 0 ? (
          <TreeItems collection={collection} items={collection.items} depth={1} parentId={null} />
        ) : (
          <p className="py-1 pl-6 text-xs text-neutral-500">Empty collection</p>
        ))}
    </li>
  );
}

const openImport = () => useUiStore.getState().openDialog({ kind: "import" });

export function CollectionsPanel() {
  const collections = useWorkspaceStore((s) => s.collections);
  return (
    <section aria-label="Collections">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Collections
        </h2>
        <div className="flex">
          <Button
            variant="ghost"
            className="px-2 py-0.5"
            aria-label="Import collections"
            onClick={openImport}
          >
            Import
          </Button>
          <Button
            variant="ghost"
            className="px-2 py-0.5"
            onClick={() => useWorkspaceStore.getState().createCollection()}
          >
            + New
          </Button>
        </div>
      </div>
      {collections.length === 0 ? (
        <EmptyState>
          <p>No collections yet.</p>
          <Button variant="primary" className="mt-2" onClick={openImport}>
            Import from Postman
          </Button>
          <p className="mt-2 text-xs">or drop exported .json files anywhere in this window</p>
        </EmptyState>
      ) : (
        <ul className="text-sm">
          {collections.map((collection) => (
            <CollectionNode key={collection.id} collection={collection} />
          ))}
        </ul>
      )}
    </section>
  );
}
