import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createMemoryDocumentStore,
  createMemorySecretStore,
  type DocumentStore,
  type SecretStore,
} from "@narada/core/storage/document-store";

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

export function defaultStores(): { documents: DocumentStore; secrets: SecretStore } {
  if (isTauri()) return { documents: tauriDocumentStore, secrets: keychainSecretStore };
  return {
    documents: createMemoryDocumentStore(globalThis.localStorage),
    secrets: createMemorySecretStore(),
  };
}
