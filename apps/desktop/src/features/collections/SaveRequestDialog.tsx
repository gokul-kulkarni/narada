import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button, Select, TextInput } from "../../components/ui";
import { listFolders, upsertRequest } from "../../lib/collection-tree";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const NEW_COLLECTION = "__new__";

export function SaveRequestDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === tabId));
  const collections = useWorkspaceStore((s) => s.collections);
  const [name, setName] = useState(tab?.request.name ?? "");
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? NEW_COLLECTION);
  const [newName, setNewName] = useState("My Collection");
  const [folderId, setFolderId] = useState("");
  if (!tab) return null;

  const folders = listFolders(
    collections.find((c) => c.id === collectionId) ?? ({ items: [] } as never),
  );

  const save = async () => {
    const workspace = useWorkspaceStore.getState();
    const targetId =
      collectionId === NEW_COLLECTION
        ? workspace.createCollection(newName.trim() || "My Collection").id
        : collectionId;
    const request = { ...tab.request, name: name.trim() || tab.request.name };
    await workspace.updateCollection(targetId, (c) => upsertRequest(c, request, folderId || null));
    useTabsStore.getState().patchTab(tab.id, {
      request,
      source: { collectionId: targetId, requestId: request.id },
      dirty: false,
    });
    onClose();
  };

  return (
    <Modal title="Save request" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          Request name
          <TextInput
            aria-label="Request name to save"
            className="mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Collection
          <Select
            aria-label="Collection"
            className="mt-1 w-full"
            value={collectionId}
            onChange={(e) => (setCollectionId(e.target.value), setFolderId(""))}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_COLLECTION}>+ New collection…</option>
          </Select>
        </label>
        {collectionId === NEW_COLLECTION ? (
          <label className="block">
            New collection name
            <TextInput
              aria-label="New collection name"
              className="mt-1 w-full"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
        ) : (
          folders.length > 0 && (
            <label className="block">
              Folder
              <Select
                aria-label="Folder"
                className="mt-1 w-full"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">(collection root)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {"  ".repeat(f.depth)}
                    {f.name}
                  </option>
                ))}
              </Select>
            </label>
          )
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
