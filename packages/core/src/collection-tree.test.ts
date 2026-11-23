import { describe, expect, it } from "vitest";
import { newCollection, newRequest } from "./factories";
import {
  addItem,
  findRequest,
  listFolders,
  moveItem,
  removeItem,
  requestIdsIn,
  renameItem,
  updateRequestInCollection,
  upsertRequest,
} from "./collection-tree";
import type { Collection, CollectionItem, FolderItem } from "./model";
import { asHttp } from "./testing/http";

const folder = (
  id: string,
  items: FolderItem["items"] = [],
  auth: FolderItem["auth"] = { type: "inherit" },
): FolderItem => ({
  kind: "folder",
  id,
  name: id,
  auth,
  items,
});

function sample(): Collection {
  const inner = newRequest({ id: "r-inner", name: "inner" });
  const top = newRequest({ id: "r-top", name: "top" });
  return {
    ...newCollection("C"),
    auth: { type: "bearer", token: "c" },
    items: [
      folder("f1", [
        folder("f2", [{ kind: "request", request: inner }], {
          type: "basic",
          username: "u",
          password: "",
        }),
      ]),
      { kind: "request", request: top },
    ],
  };
}

describe("collection tree", () => {
  it("finds requests with their auth chain, innermost first", () => {
    const found = findRequest(sample(), "r-inner");
    expect(found?.request.name).toBe("inner");
    expect(found?.authChain.map((a) => a.type)).toEqual(["basic", "inherit", "bearer"]);
    expect(found?.folderPath).toEqual(["f1", "f2"]);
    expect(findRequest(sample(), "missing")).toBeUndefined();
  });

  it("updates a request without touching the original", () => {
    const original = sample();
    const next = updateRequestInCollection(original, "r-inner", (r) => ({ ...r, url: "x" }));
    expect(asHttp(findRequest(next, "r-inner")?.request).url).toBe("x");
    expect(asHttp(findRequest(original, "r-inner")?.request).url).toBe("");
  });

  it("adds items at the root or inside a folder", () => {
    const request = newRequest({ id: "new" });
    const atRoot = addItem(sample(), null, { kind: "request", request });
    expect(atRoot.items.at(-1)).toEqual({ kind: "request", request });
    const inFolder = addItem(sample(), "f2", folder("f3"));
    expect(listFolders(inFolder).map((f) => [f.id, f.depth])).toEqual([
      ["f1", 0],
      ["f2", 1],
      ["f3", 2],
    ]);
  });

  it("upserts: replaces an existing request or adds it to the target folder", () => {
    const replaced = upsertRequest(sample(), newRequest({ id: "r-top", name: "renamed" }), null);
    expect(findRequest(replaced, "r-top")?.request.name).toBe("renamed");
    const added = upsertRequest(sample(), newRequest({ id: "brand-new" }), "f1");
    expect(findRequest(added, "brand-new")?.folderPath).toEqual(["f1"]);
  });

  it("removes and renames requests and folders", () => {
    const removed = removeItem(sample(), "f2");
    expect(findRequest(removed, "r-inner")).toBeUndefined();
    expect(findRequest(removeItem(sample(), "r-top"), "r-top")).toBeUndefined();
    const renamed = renameItem(renameItem(sample(), "f1", "Folder One"), "r-top", "Top!");
    expect(listFolders(renamed)[0].name).toBe("Folder One");
    expect(findRequest(renamed, "r-top")?.request.name).toBe("Top!");
  });
});

describe("moveItem", () => {
  const request = (id: string) => newRequest({ id, name: id });
  const folder = (id: string, items: CollectionItem[]): CollectionItem => ({
    kind: "folder",
    id,
    name: id,
    auth: { type: "inherit" },
    items,
  });
  const shop: Collection = {
    ...newCollection("Shop"),
    id: "shop",
    items: [
      folder("orders", [{ kind: "request", request: request("create") }, folder("admin", [])]),
      folder("users", []),
      { kind: "request", request: request("health") },
    ],
  };
  const billing: Collection = {
    ...newCollection("Billing"),
    id: "billing",
    items: [folder("invoices", [])],
  };
  const shape = (items: readonly CollectionItem[]): unknown =>
    items.map((i) => (i.kind === "folder" ? { [i.id]: shape(i.items) } : i.request.id));

  it("moves a request to another folder in the same collection", () => {
    const moved = moveItem(
      [shop, billing],
      { collectionId: "shop", itemId: "create" },
      { collectionId: "shop", folderId: "users" },
    );
    expect(moved?.map((c) => c.id)).toEqual(["shop"]);
    expect(shape(moved?.[0]?.items ?? [])).toEqual([
      { orders: [{ admin: [] }] },
      { users: ["create"] },
      "health",
    ]);
    expect(shape(shop.items)).toEqual([
      { orders: ["create", { admin: [] }] },
      { users: [] },
      "health",
    ]);
  });

  it("moves to the top of a collection, and into another collection", () => {
    const top = moveItem(
      [shop],
      { collectionId: "shop", itemId: "create" },
      { collectionId: "shop", folderId: null },
    );
    expect(shape(top?.[0]?.items ?? [])).toEqual([
      { orders: [{ admin: [] }] },
      { users: [] },
      "health",
      "create",
    ]);
    const across = moveItem(
      [shop, billing],
      { collectionId: "shop", itemId: "orders" },
      { collectionId: "billing", folderId: "invoices" },
    );
    expect(across?.map((c) => c.id)).toEqual(["shop", "billing"]);
    expect(shape(across?.[0]?.items ?? [])).toEqual([{ users: [] }, "health"]);
    expect(shape(across?.[1]?.items ?? [])).toEqual([
      { invoices: [{ orders: ["create", { admin: [] }] }] },
    ]);
  });

  it("refuses moves that make no sense", () => {
    const all = [shop, billing];
    const from = (itemId: string) => ({ collectionId: "shop", itemId });
    expect(moveItem(all, from("orders"), { collectionId: "shop", folderId: "orders" })).toBeNull();
    expect(moveItem(all, from("orders"), { collectionId: "shop", folderId: "admin" })).toBeNull();
    expect(moveItem(all, from("create"), { collectionId: "shop", folderId: "orders" })).toBeNull();
    expect(moveItem(all, from("nope"), { collectionId: "shop", folderId: null })).toBeNull();
    expect(moveItem(all, from("create"), { collectionId: "shop", folderId: "nope" })).toBeNull();
    expect(moveItem(all, from("create"), { collectionId: "nope", folderId: null })).toBeNull();
  });
});

describe("requestIdsIn", () => {
  it("lists a request's own id, or every request inside a folder", () => {
    const item: CollectionItem = {
      kind: "folder",
      id: "f",
      name: "f",
      auth: { type: "inherit" },
      items: [{ kind: "request", request: newRequest({ id: "a" }) }],
    };
    expect(requestIdsIn(item)).toEqual(["a"]);
    expect(requestIdsIn({ kind: "request", request: newRequest({ id: "b" }) })).toEqual(["b"]);
  });
});
