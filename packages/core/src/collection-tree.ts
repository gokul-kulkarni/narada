import type { Auth, Collection, CollectionItem, FolderItem, RequestDef } from "./model";

export interface FoundRequest {
  readonly request: RequestDef;
  /** Folder auths innermost first, then the collection auth. */
  readonly authChain: readonly Auth[];
  readonly folderPath: readonly string[];
}

const itemId = (item: CollectionItem) => (item.kind === "folder" ? item.id : item.request.id);

function findIn(
  items: readonly CollectionItem[],
  requestId: string,
  parents: readonly FolderItem[],
): FoundRequest | undefined {
  for (const item of items) {
    if (item.kind === "request" && item.request.id === requestId) {
      return {
        request: item.request,
        authChain: [...parents].reverse().map((f) => f.auth),
        folderPath: parents.map((f) => f.id),
      };
    }
    if (item.kind === "folder") {
      const found = findIn(item.items, requestId, [...parents, item]);
      if (found) return found;
    }
  }
  return undefined;
}

export function findRequest(collection: Collection, requestId: string): FoundRequest | undefined {
  const found = findIn(collection.items, requestId, []);
  return found && { ...found, authChain: [...found.authChain, collection.auth] };
}

/** Maps every item in the tree (depth-first) and returns a new tree. */
function mapItems(
  items: readonly CollectionItem[],
  map: (item: CollectionItem) => CollectionItem,
): CollectionItem[] {
  return items.map((item) => {
    const mapped = map(item);
    return mapped.kind === "folder" ? { ...mapped, items: mapItems(mapped.items, map) } : mapped;
  });
}

export function updateRequestInCollection(
  collection: Collection,
  requestId: string,
  update: (request: RequestDef) => RequestDef,
): Collection {
  return {
    ...collection,
    items: mapItems(collection.items, (item) =>
      item.kind === "request" && item.request.id === requestId
        ? { ...item, request: update(item.request) }
        : item,
    ),
  };
}

export function addItem(
  collection: Collection,
  folderId: string | null,
  newItem: CollectionItem,
): Collection {
  if (folderId === null) return { ...collection, items: [...collection.items, newItem] };
  return {
    ...collection,
    items: mapItems(collection.items, (item) =>
      item.kind === "folder" && item.id === folderId
        ? { ...item, items: [...item.items, newItem] }
        : item,
    ),
  };
}

export function upsertRequest(
  collection: Collection,
  request: RequestDef,
  folderId: string | null,
): Collection {
  return findRequest(collection, request.id)
    ? updateRequestInCollection(collection, request.id, () => request)
    : addItem(collection, folderId, { kind: "request", request });
}

function filterItems(items: readonly CollectionItem[], id: string): CollectionItem[] {
  return items
    .filter((item) => itemId(item) !== id)
    .map((item) =>
      item.kind === "folder" ? { ...item, items: filterItems(item.items, id) } : item,
    );
}

export function removeItem(collection: Collection, id: string): Collection {
  return { ...collection, items: filterItems(collection.items, id) };
}

export function renameItem(collection: Collection, id: string, name: string): Collection {
  return {
    ...collection,
    items: mapItems(collection.items, (item) => {
      if (item.kind === "folder") return item.id === id ? { ...item, name } : item;
      return item.request.id === id ? { ...item, request: { ...item.request, name } } : item;
    }),
  };
}

export function updateFolder(
  collection: Collection,
  folderId: string,
  update: (folder: FolderItem) => FolderItem,
): Collection {
  return {
    ...collection,
    items: mapItems(collection.items, (item) =>
      item.kind === "folder" && item.id === folderId ? update(item) : item,
    ),
  };
}

export interface FolderEntry {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}

export function listFolders(collection: Pick<Collection, "items">): FolderEntry[] {
  const walk = (items: readonly CollectionItem[], depth: number): FolderEntry[] =>
    items.flatMap((item) =>
      item.kind === "folder"
        ? [{ id: item.id, name: item.name, depth }, ...walk(item.items, depth + 1)]
        : [],
    );
  return walk(collection.items, 0);
}

/** All requests in tree order — the order the collection runner uses. */
export function flattenRequests(items: readonly CollectionItem[]): RequestDef[] {
  return items.flatMap((item) =>
    item.kind === "request" ? [item.request] : flattenRequests(item.items),
  );
}

export function findFolder(
  items: readonly CollectionItem[],
  folderId: string,
): FolderItem | undefined {
  for (const item of items) {
    if (item.kind !== "folder") continue;
    if (item.id === folderId) return item;
    const found = findFolder(item.items, folderId);
    if (found) return found;
  }
  return undefined;
}

function findItemIn(items: readonly CollectionItem[], id: string): CollectionItem | undefined {
  for (const item of items) {
    if (item.kind === "request" && item.request.id === id) return item;
    if (item.kind === "folder") {
      if (item.id === id) return item;
      const inner = findItemIn(item.items, id);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** The folder holding `id` (null for the collection's top level); undefined if absent. */
function parentOf(
  items: readonly CollectionItem[],
  id: string,
  parent: string | null = null,
): string | null | undefined {
  for (const item of items) {
    const itemId = item.kind === "folder" ? item.id : item.request.id;
    if (itemId === id) return parent;
    if (item.kind === "folder") {
      const found = parentOf(item.items, id, item.id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** A request or folder anywhere in the collection, by id. */
export const findItem = (collection: Collection, id: string): CollectionItem | undefined =>
  findItemIn(collection.items, id);

/** Folder names from the top of the collection down to `folderId`; null if it isn't there. */
export function folderPath(collection: Collection, folderId: string): string[] | null {
  const walk = (items: readonly CollectionItem[], path: string[]): string[] | null => {
    for (const item of items) {
      if (item.kind !== "folder") continue;
      const here = [...path, item.name];
      if (item.id === folderId) return here;
      const inner = walk(item.items, here);
      if (inner) return inner;
    }
    return null;
  };
  return walk(collection.items, []);
}

/** The ids of the requests in an item: its own, or every request inside a folder. */
export function requestIdsIn(item: CollectionItem): string[] {
  return item.kind === "request" ? [item.request.id] : item.items.flatMap(requestIdsIn);
}

export interface MoveSource {
  readonly collectionId: string;
  readonly itemId: string;
}

export interface MoveTarget {
  readonly collectionId: string;
  /** null for the collection's top level. */
  readonly folderId: string | null;
}

/**
 * Moves a request or folder to the top of a collection or into a folder, also across
 * collections. Returns the changed collections (one, or source and target), or null when the
 * move makes no sense: unknown item or target, already there, or a folder into itself.
 */
export function moveItem(
  collections: readonly Collection[],
  from: MoveSource,
  to: MoveTarget,
): Collection[] | null {
  const source = collections.find((c) => c.id === from.collectionId);
  const target = collections.find((c) => c.id === to.collectionId);
  const item = source && findItemIn(source.items, from.itemId);
  if (!source || !target || !item) return null;
  if (to.folderId !== null) {
    const folder = findItemIn(target.items, to.folderId);
    if (folder?.kind !== "folder") return null;
    if (item.kind === "folder" && findItemIn([item], to.folderId)) return null;
  }
  const sameCollection = source.id === target.id;
  if (sameCollection && parentOf(source.items, from.itemId) === to.folderId) return null;

  const removed = removeItem(source, from.itemId);
  const added = addItem(sameCollection ? removed : target, to.folderId, item);
  return sameCollection ? [added] : [removed, added];
}
