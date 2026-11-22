// Adds a request parsed from a cURL command to a collection file, the one thing the plugin writes.
import { addItem, findFolder } from "@narada/core/collection-tree";
import { parseCurl } from "@narada/core/curl";
import { errorMessage } from "@narada/core/format";
import type { Collection } from "@narada/core/model";
import { fromPostmanCollection, toPostmanCollection } from "@narada/core/postman/collection";
import type { DocumentStore } from "@narada/core/storage/document-store";
import type { CreateInput, CreateResult } from "../protocol";
import { requestKey } from "./snapshot";

const MAX_NAME = 200;

/** "PATCH /orders/7" from the method and the URL's path, without the host or a {{base}} prefix. */
export function defaultName(method: string, url: string): string {
  const path = url
    .split(/[?#]/)[0]
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    .replace(/^\{\{[^{}]*\}\}/, "");
  return `${method} ${path || url || "/"}`.slice(0, MAX_NAME);
}

/** The collection with this id and the file it was read from, read fresh from disk. */
async function findCollectionFile(
  store: DocumentStore,
  collectionId: string,
): Promise<{ fileName: string; collection: Collection } | null> {
  for (const doc of await store.list("collections")) {
    try {
      const collection = fromPostmanCollection(JSON.parse(doc.content));
      if (collection.id === collectionId) return { fileName: doc.fileName, collection };
    } catch {
      // Unreadable files are reported by workspace.load; they can't be the target.
    }
  }
  return null;
}

export async function createFromCurl(
  store: DocumentStore,
  input: CreateInput,
): Promise<CreateResult> {
  try {
    const parsed = parseCurl(input.curl);
    const name = input.name.trim().slice(0, MAX_NAME) || defaultName(parsed.method, parsed.url);
    const request = { ...parsed, name };

    const found = await findCollectionFile(store, input.collectionId);
    if (!found) {
      return {
        ok: false,
        error: "That collection is no longer in the folder. Reload and try again.",
      };
    }
    if (input.folderId !== null && !findFolder(found.collection.items, input.folderId)) {
      return {
        ok: false,
        error: "That folder is no longer in the collection. Reload and try again.",
      };
    }
    const updated = addItem(found.collection, input.folderId, { kind: "request", request });
    const content = `${JSON.stringify(toPostmanCollection(updated), null, 2)}\n`;
    await store.write("collections", found.fileName, content);
    return { ok: true, key: requestKey(updated.id, request.id) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
