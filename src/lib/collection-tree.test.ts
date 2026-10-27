import { describe, expect, it } from "vitest";
import { newCollection, newRequest } from "./factories";
import {
  addItem,
  findRequest,
  listFolders,
  removeItem,
  renameItem,
  updateRequestInCollection,
  upsertRequest,
} from "./collection-tree";
import type { Collection, FolderItem } from "./model";

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
    expect(findRequest(next, "r-inner")?.request.url).toBe("x");
    expect(findRequest(original, "r-inner")?.request.url).toBe("");
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
