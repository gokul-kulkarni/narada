import { beforeEach, describe, expect, it } from "vitest";
import { newKeyValue } from "../lib/factories";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "../lib/postman/fixtures";
import {
  createMemoryDocumentStore,
  createMemorySecretStore,
  type DocumentStore,
} from "../lib/storage/document-store";
import { setServices } from "./services";
import { selectActiveEnvironment, useWorkspaceStore } from "./workspace-store";

let documents: DocumentStore;

const reset = () =>
  useWorkspaceStore.setState({
    loaded: false,
    collections: [],
    environments: [],
    globals: [],
    activeEnvironmentId: null,
    loadErrors: [],
    lastError: null,
  });

describe("workspace store", () => {
  beforeEach(() => {
    documents = createMemoryDocumentStore();
    setServices({ documents, secrets: createMemorySecretStore() });
    localStorage.clear();
    reset();
  });

  it("creates, updates and deletes collections on disk", async () => {
    const store = useWorkspaceStore.getState();
    const collection = store.createCollection("API");
    await store.updateCollection(collection.id, (c) => ({ ...c, name: "API v2" }));
    const [doc] = await documents.list("collections");
    expect(JSON.parse(doc.content).info.name).toBe("API v2");
    await useWorkspaceStore.getState().deleteCollection(collection.id);
    expect(await documents.list("collections")).toEqual([]);
    expect(useWorkspaceStore.getState().collections).toEqual([]);
  });

  it("imports collections and environments, re-identifying duplicates", async () => {
    const store = useWorkspaceStore.getState();
    const first = await store.importCollection(POSTMAN_COLLECTION);
    const second = await useWorkspaceStore.getState().importCollection(POSTMAN_COLLECTION);
    expect(first.id).not.toBe(second.id);
    const env = await useWorkspaceStore.getState().importEnvironment(POSTMAN_ENVIRONMENT);
    const env2 = await useWorkspaceStore.getState().importEnvironment(POSTMAN_ENVIRONMENT);
    expect(env.id).not.toBe(env2.id);
    expect(await documents.list("collections")).toHaveLength(2);
  });

  it("loads everything back, restoring the active environment", async () => {
    const env = await useWorkspaceStore.getState().importEnvironment(POSTMAN_ENVIRONMENT);
    useWorkspaceStore.getState().setActiveEnvironment(env.id);
    await useWorkspaceStore.getState().setGlobals([newKeyValue("g", "1")]);
    await documents.write("collections", "broken.postman_collection.json", "nope");
    reset();
    await useWorkspaceStore.getState().load();
    const state = useWorkspaceStore.getState();
    expect(state.loaded).toBe(true);
    expect(selectActiveEnvironment(state)?.name).toBe("Staging");
    expect(state.globals.map((g) => g.key)).toEqual(["g"]);
    expect(state.loadErrors.map((e) => e.fileName)).toEqual(["broken.postman_collection.json"]);
  });

  it("updates and deletes environments, clearing the active one", async () => {
    const env = useWorkspaceStore.getState().createEnvironment("Dev");
    useWorkspaceStore.getState().setActiveEnvironment(env.id);
    await useWorkspaceStore.getState().updateEnvironment(env.id, (e) => ({ ...e, name: "Dev 2" }));
    expect(useWorkspaceStore.getState().environments[0].name).toBe("Dev 2");
    await useWorkspaceStore.getState().deleteEnvironment(env.id);
    expect(useWorkspaceStore.getState().activeEnvironmentId).toBeNull();
  });

  it("records save failures", async () => {
    setServices({
      documents: { ...documents, write: async () => Promise.reject(new Error("disk full")) },
      secrets: createMemorySecretStore(),
    });
    const collection = useWorkspaceStore.getState().createCollection();
    await useWorkspaceStore.getState().updateCollection(collection.id, (c) => c);
    expect(useWorkspaceStore.getState().lastError).toBe("Could not save: disk full");
    useWorkspaceStore.getState().clearError();
    expect(useWorkspaceStore.getState().lastError).toBeNull();
  });

  it("ignores updates to unknown ids", async () => {
    await useWorkspaceStore.getState().updateCollection("nope", (c) => c);
    await useWorkspaceStore.getState().updateEnvironment("nope", (e) => e);
    await useWorkspaceStore.getState().deleteCollection("nope");
    await useWorkspaceStore.getState().deleteEnvironment("nope");
    expect(useWorkspaceStore.getState().lastError).toBeNull();
  });
});
