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
