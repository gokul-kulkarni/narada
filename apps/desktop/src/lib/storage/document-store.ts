import { invoke, isTauri } from "@tauri-apps/api/core";

export type DocumentKind = "collections" | "environments" | "mcp";
export type LocalFile = "history.json" | "globals.json" | "sync-state.json" | "mcp-trust.json";

export interface StoredDocument {
  readonly fileName: string;
  readonly content: string;
}

/** Synced documents live in the storage folder; local files stay on this machine. */
export interface DocumentStore {
  list(kind: DocumentKind): Promise<StoredDocument[]>;
  write(kind: DocumentKind, fileName: string, content: string): Promise<void>;
  remove(kind: DocumentKind, fileName: string): Promise<void>;
  readLocal(name: LocalFile): Promise<string | null>;
  writeLocal(name: LocalFile, content: string): Promise<void>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const tauriDocumentStore: DocumentStore = {
  list: (kind) => invoke("list_documents", { kind }),
  write: (kind, fileName, content) => invoke("write_document", { kind, fileName, content }),
  remove: (kind, fileName) => invoke("delete_document", { kind, fileName }),
  readLocal: (name) => invoke("read_local", { name }),
  writeLocal: (name, content) => invoke("write_local", { name, content }),
};

export const keychainSecretStore: SecretStore = {
  get: (key) => invoke("secret_get", { key }),
  set: (key, value) => invoke("secret_set", { key, value }),
  remove: (key) => invoke("secret_delete", { key }),
};

/** In-memory store for tests and the browser build; `persist` mirrors it into a Storage. */
export function createMemoryDocumentStore(persist?: Storage): DocumentStore {
  const prefix = "narada:";
  const read = (key: string) => {
    try {
      return persist?.getItem(prefix + key) ?? null;
    } catch {
      return null;
    }
  };
  const files = new Map<string, string>();
  const load = (key: string) => files.get(key) ?? read(key);
  const save = (key: string, content: string | null) => {
    if (content === null) files.delete(key);
    else files.set(key, content);
    try {
      if (content === null) persist?.removeItem(prefix + key);
      else persist?.setItem(prefix + key, content);
    } catch {
      // Storage may be unavailable (private mode); memory copy still works.
    }
  };
  const index = (kind: DocumentKind): string[] => JSON.parse(load(`${kind}/index`) ?? "[]");

  return {
    async list(kind) {
      return index(kind)
        .sort()
        .flatMap((fileName) => {
          const content = load(`${kind}/${fileName}`);
          return content === null ? [] : [{ fileName, content }];
        });
    },
    async write(kind, fileName, content) {
      save(`${kind}/${fileName}`, content);
      save(`${kind}/index`, JSON.stringify([...new Set([...index(kind), fileName])]));
    },
    async remove(kind, fileName) {
      save(`${kind}/${fileName}`, null);
      save(`${kind}/index`, JSON.stringify(index(kind).filter((name) => name !== fileName)));
    },
    async readLocal(name) {
      return load(`local/${name}`);
    },
    async writeLocal(name, content) {
      save(`local/${name}`, content);
    },
  };
}

export function createMemorySecretStore(): SecretStore {
  const secrets = new Map<string, string>();
  return {
    async get(key) {
      return secrets.get(key) ?? null;
    },
    async set(key, value) {
      secrets.set(key, value);
    },
    async remove(key) {
      secrets.delete(key);
    },
  };
}

export function defaultStores(): { documents: DocumentStore; secrets: SecretStore } {
  if (isTauri()) return { documents: tauriDocumentStore, secrets: keychainSecretStore };
  return {
    documents: createMemoryDocumentStore(globalThis.localStorage),
    secrets: createMemorySecretStore(),
  };
}
