import { defaultStores, type DocumentStore, type SecretStore } from "../lib/storage/document-store";

export interface Services {
  documents: DocumentStore;
  secrets: SecretStore;
}

let services: Services | null = null;

/** Lazily picks Tauri or browser stores; tests swap in memory stores with `setServices`. */
export function getServices(): Services {
  services ??= defaultStores();
  return services;
}

export function setServices(next: Services): void {
  services = next;
}
