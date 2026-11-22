import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment } from "../factories";
import { POSTMAN_COLLECTION } from "../postman/fixtures";
import { createMemoryDocumentStore, createMemorySecretStore } from "./document-store";
import {
  collectionFileName,
  deleteCollection,
  deleteEnvironment,
  fileStem,
  loadCollections,
  loadEnvironments,
  saveCollection,
  saveEnvironment,
  secretKey,
} from "./workspace-repository";

describe("workspace repository", () => {
  it("saves collections as Postman files and loads them back", async () => {
    const store = createMemoryDocumentStore();
    const collection = { ...newCollection("Mine"), id: "abc" };
    await saveCollection(store, collection);
    const [doc] = await store.list("collections");
    expect(doc.fileName).toBe("abc.postman_collection.json");
    expect(JSON.parse(doc.content).info.schema).toContain("v2.1.0");
    expect((await loadCollections(store)).items).toEqual([collection]);
    await deleteCollection(store, collection);
    expect(await store.list("collections")).toEqual([]);
  });

  it("reports broken files instead of failing the whole load", async () => {
    const store = createMemoryDocumentStore();
    await store.write("collections", "bad.postman_collection.json", "{nope");
    await store.write(
      "collections",
      "ok.postman_collection.json",
      JSON.stringify(POSTMAN_COLLECTION),
    );
    const loaded = await loadCollections(store);
    expect(loaded.items.map((c) => c.name)).toEqual(["Pet Store"]);
    expect(loaded.errors).toEqual([
      { fileName: "bad.postman_collection.json", message: expect.any(String) },
    ]);
  });

  it("keeps secret values out of environment files", async () => {
    const store = createMemoryDocumentStore();
    const secrets = createMemorySecretStore();
    const env = {
      ...newEnvironment("Prod"),
      id: "env1",
      variables: [
        { id: "a", key: "host", value: "prod.dev", enabled: true, secret: false },
        { id: "b", key: "token", value: "s3cret", enabled: true, secret: true },
      ],
    };
    await saveEnvironment(store, secrets, env);
    const [doc] = await store.list("environments");
    expect(doc.content).not.toContain("s3cret");
    expect(await secrets.get(secretKey("env1", "token"))).toBe("s3cret");

    const loaded = await loadEnvironments(store, secrets);
    expect(loaded.items[0].variables.map((v) => v.value)).toEqual(["prod.dev", "s3cret"]);

    await deleteEnvironment(store, secrets, env);
    expect(await secrets.get(secretKey("env1", "token"))).toBeNull();
  });

  it("derives safe file names from ids", () => {
    expect(fileStem("a/b:c")).toBe("a_b_c");
    expect(fileStem("")).toBe("untitled");
    expect(collectionFileName({ ...newCollection(), id: "x" })).toBe("x.postman_collection.json");
  });

  it("persists the memory store into a Storage", async () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    } as Storage;
    await createMemoryDocumentStore(storage).writeLocal("history.json", "[]");
    expect(await createMemoryDocumentStore(storage).readLocal("history.json")).toBe("[]");
  });
});
