import { addItem, removeItem, renameItem } from "../../lib/collection-tree";
import { newRequest } from "../../lib/factories";
import { newId } from "../../lib/ids";
import type { Collection, RequestDef } from "../../lib/model";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const update = (collectionId: string, change: (c: Collection) => Collection) =>
  useWorkspaceStore.getState().updateCollection(collectionId, change);

export function openSavedRequest(collectionId: string, request: RequestDef): void {
  useTabsStore.getState().openRequest(request, { collectionId, requestId: request.id });
}

export function addRequest(collectionId: string, folderId: string | null): void {
  const request = newRequest();
  void update(collectionId, (c) => addItem(c, folderId, { kind: "request", request }));
  openSavedRequest(collectionId, request);
}

export function addFolder(collectionId: string, folderId: string | null): void {
  void update(collectionId, (c) =>
    addItem(c, folderId, {
      kind: "folder",
      id: newId(),
      name: "New Folder",
      auth: { type: "inherit" },
      items: [],
    }),
  );
}

export function renameCollectionItem(collectionId: string, itemId: string, name: string): void {
  void update(collectionId, (c) => renameItem(c, itemId, name));
  const tabs = useTabsStore.getState();
  tabs.tabs
    .filter((tab) => tab.source?.requestId === itemId)
    .forEach((tab) => tabs.patchTab(tab.id, { request: { ...tab.request, name } }));
}

export function removeCollectionItem(collectionId: string, itemId: string): void {
  void update(collectionId, (c) => removeItem(c, itemId));
}

export function duplicateRequest(
  collectionId: string,
  request: RequestDef,
  folderId: string | null,
): void {
  const copy = { ...request, id: newId(), name: `${request.name} copy` };
  void update(collectionId, (c) => addItem(c, folderId, { kind: "request", request: copy }));
}
