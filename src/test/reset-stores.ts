import {
  createMemoryDocumentStore,
  createMemorySecretStore,
  type DocumentStore,
} from "../lib/storage/document-store";
import { useHistoryStore } from "../state/history-store";
import { setServices } from "../state/services";
import { useTabsStore } from "../state/tabs-store";
import { useUiStore } from "../state/ui-store";
import { useWorkspaceStore } from "../state/workspace-store";

/** Fresh in-memory services and empty stores for UI tests. */
export function resetStores(): DocumentStore {
  const documents = createMemoryDocumentStore();
  setServices({ documents, secrets: createMemorySecretStore() });
  localStorage.clear();
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useHistoryStore.setState({ entries: [] });
  useUiStore.setState({ view: { kind: "requests" }, dialog: null, notice: null });
  useWorkspaceStore.setState({
    loaded: false,
    collections: [],
    environments: [],
    globals: [],
    activeEnvironmentId: null,
    loadErrors: [],
    lastError: null,
  });
  return documents;
}
