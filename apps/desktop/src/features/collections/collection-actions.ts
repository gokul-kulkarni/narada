import {
  addItem,
  findItem,
  folderPath,
  moveItem,
  removeItem,
  renameItem,
  requestIdsIn,
  type MoveSource,
  type MoveTarget,
} from "@narada/core/collection-tree";
import { useUiStore } from "../../state/ui-store";
import { newRequest } from "@narada/core/factories";
import { newId } from "@narada/core/ids";
import type { Collection, RequestDef } from "@narada/core/model";
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

/** "Shop / orders / admin", or "Shop" for the top level. */
export function destinationLabel(collections: readonly Collection[], to: MoveTarget): string {
  const collection = collections.find((c) => c.id === to.collectionId);
  if (!collection) return "";
  const path = to.folderId === null ? [] : (folderPath(collection, to.folderId) ?? []);
  return [collection.name, ...path].join(" / ");
}

/**
 * Moves a request or folder (also to another collection) and saves the changed collections.
 * Open tabs of the moved requests follow them. Returns false when the move makes no sense.
 */
export function moveCollectionItem(from: MoveSource, to: MoveTarget): boolean {
  const { collections, updateCollection } = useWorkspaceStore.getState();
  const source = collections.find((c) => c.id === from.collectionId);
  const item = source && findItem(source, from.itemId);
  const changed = item && moveItem(collections, from, to);
  if (!item || !changed) return false;

  changed.forEach((collection) => void updateCollection(collection.id, () => collection));
  if (from.collectionId !== to.collectionId) {
    const moved = new Set(requestIdsIn(item));
    const tabs = useTabsStore.getState();
    tabs.tabs
      .filter((tab) => tab.source && moved.has(tab.source.requestId))
      .forEach((tab) =>
        tabs.patchTab(tab.id, {
          source: { collectionId: to.collectionId, requestId: tab.source?.requestId ?? "" },
        }),
      );
  }
  const name = item.kind === "folder" ? item.name : item.request.name;
  useUiStore.getState().notify(`Moved "${name}" to ${destinationLabel(collections, to)}.`);
  return true;
}
