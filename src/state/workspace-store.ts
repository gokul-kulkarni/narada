import { create } from "zustand";
import { newCollection, newEnvironment } from "../lib/factories";
import { errorMessage } from "../lib/format";
import { newId } from "../lib/ids";
import type { Collection, Environment, KeyValue } from "../lib/model";
import { fromPostmanCollection } from "../lib/postman/collection";
import { fromPostmanEnvironment } from "../lib/postman/environment";
import * as repo from "../lib/storage/workspace-repository";
import { getServices } from "./services";

const ACTIVE_ENV_KEY = "narada:active-environment";

interface WorkspaceState {
  readonly loaded: boolean;
  readonly collections: readonly Collection[];
  readonly environments: readonly Environment[];
  readonly globals: readonly KeyValue[];
  readonly activeEnvironmentId: string | null;
  readonly loadErrors: readonly repo.LoadError[];
  readonly lastError: string | null;

  load: () => Promise<void>;
  createCollection: (name?: string) => Collection;
  updateCollection: (id: string, update: (collection: Collection) => Collection) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  importCollection: (json: unknown) => Promise<Collection>;
  createEnvironment: (name?: string) => Environment;
  updateEnvironment: (
    id: string,
    update: (environment: Environment) => Environment,
  ) => Promise<void>;
  deleteEnvironment: (id: string) => Promise<void>;
  importEnvironment: (json: unknown) => Promise<Environment>;
  setActiveEnvironment: (id: string | null) => void;
  setGlobals: (globals: readonly KeyValue[]) => Promise<void>;
  clearError: () => void;
}

function readActiveEnvironment(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_ENV_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeActiveEnvironment(id: string | null): void {
  try {
    if (id) globalThis.localStorage?.setItem(ACTIVE_ENV_KEY, id);
    else globalThis.localStorage?.removeItem(ACTIVE_ENV_KEY);
  } catch {
    // Not persisting the selection is harmless.
  }
}

function parseGlobals(content: string | null): KeyValue[] {
  if (!content) return [];
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed)
      ? parsed.filter(
          (row): row is KeyValue => typeof row?.key === "string" && typeof row?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** Serialises writes per file so a slow write can never overwrite a newer one. */
const writeChains = new Map<string, Promise<void>>();
function queueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const next = (writeChains.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
  writeChains.set(key, next);
  return next;
}

/** Resolves once every queued write has finished (used before syncing). */
export async function flushWrites(): Promise<void> {
  await Promise.allSettled([...writeChains.values()]);
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const persist = async (key: string, write: () => Promise<void>) => {
    try {
      await queueWrite(key, write);
    } catch (error) {
      set({ lastError: `Could not save: ${errorMessage(error)}` });
    }
  };

  const persistCollection = (collection: Collection) =>
    persist(`c:${collection.id}`, () => repo.saveCollection(getServices().documents, collection));

  const persistEnvironment = (environment: Environment) =>
    persist(`e:${environment.id}`, () =>
      repo.saveEnvironment(getServices().documents, getServices().secrets, environment),
    );

  return {
    loaded: false,
    collections: [],
    environments: [],
    globals: [],
    activeEnvironmentId: null,
    loadErrors: [],
    lastError: null,

    load: async () => {
      const { documents, secrets } = getServices();
      try {
        const [collections, environments, globals] = await Promise.all([
          repo.loadCollections(documents),
          repo.loadEnvironments(documents, secrets),
          documents.readLocal("globals.json"),
        ]);
        const stored = readActiveEnvironment();
        set({
          loaded: true,
          collections: collections.items,
          environments: environments.items,
          globals: parseGlobals(globals),
          activeEnvironmentId: environments.items.some((e) => e.id === stored) ? stored : null,
          loadErrors: [...collections.errors, ...environments.errors],
        });
      } catch (error) {
        set({ loaded: true, lastError: `Could not load workspace: ${errorMessage(error)}` });
      }
    },

    createCollection: (name) => {
      const collection = newCollection(name);
      set((s) => ({ collections: [...s.collections, collection] }));
      void persistCollection(collection);
      return collection;
    },

    updateCollection: async (id, update) => {
      const current = get().collections.find((c) => c.id === id);
      if (!current) return;
      const next = update(current);
      set((s) => ({ collections: s.collections.map((c) => (c.id === id ? next : c)) }));
      await persistCollection(next);
    },

    deleteCollection: async (id) => {
      const collection = get().collections.find((c) => c.id === id);
      if (!collection) return;
      set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
      await persist(`c:${id}`, () => repo.deleteCollection(getServices().documents, collection));
    },

    importCollection: async (json) => {
      const parsed = fromPostmanCollection(json);
      const exists = get().collections.some((c) => c.id === parsed.id);
      const collection = exists ? { ...parsed, id: newId() } : parsed;
      set((s) => ({ collections: [...s.collections, collection] }));
      await persistCollection(collection);
      return collection;
    },

    createEnvironment: (name) => {
      const environment = newEnvironment(name);
      set((s) => ({ environments: [...s.environments, environment] }));
      void persistEnvironment(environment);
      return environment;
    },

    updateEnvironment: async (id, update) => {
      const current = get().environments.find((e) => e.id === id);
      if (!current) return;
      const next = update(current);
      set((s) => ({ environments: s.environments.map((e) => (e.id === id ? next : e)) }));
      await persistEnvironment(next);
    },

    deleteEnvironment: async (id) => {
      const environment = get().environments.find((e) => e.id === id);
      if (!environment) return;
      set((s) => ({
        environments: s.environments.filter((e) => e.id !== id),
        activeEnvironmentId: s.activeEnvironmentId === id ? null : s.activeEnvironmentId,
      }));
      if (get().activeEnvironmentId === null) writeActiveEnvironment(null);
      await persist(`e:${id}`, () =>
        repo.deleteEnvironment(getServices().documents, getServices().secrets, environment),
      );
    },

    importEnvironment: async (json) => {
      const parsed = fromPostmanEnvironment(json);
      const exists = get().environments.some((e) => e.id === parsed.id);
      const environment = exists ? { ...parsed, id: newId() } : parsed;
      set((s) => ({ environments: [...s.environments, environment] }));
      await persistEnvironment(environment);
      return environment;
    },

    setActiveEnvironment: (id) => {
      writeActiveEnvironment(id);
      set({ activeEnvironmentId: id });
    },

    setGlobals: async (globals) => {
      set({ globals });
      await persist("globals", () =>
        getServices().documents.writeLocal("globals.json", JSON.stringify(globals, null, 2)),
      );
    },

    clearError: () => set({ lastError: null }),
  };
});

export const selectActiveEnvironment = (state: WorkspaceState): Environment | undefined =>
  state.environments.find((e) => e.id === state.activeEnvironmentId);
