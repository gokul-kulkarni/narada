import {
  createMemoryDocumentStore,
  createMemorySecretStore,
  type DocumentStore,
} from "../lib/storage/document-store";
import { setMcpClient } from "../lib/mcp/client";
import { useHistoryStore } from "../state/history-store";
import { useMcpStore } from "../state/mcp-store";
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
  useUiStore.setState({
    view: { kind: "requests" },
    dialog: null,
    notice: null,
    revealed: new Set(),
  });
  useWorkspaceStore.setState({
    loaded: false,
    collections: [],
    environments: [],
    globals: [],
    activeEnvironmentId: null,
    loadErrors: [],
    lastError: null,
  });
  useMcpStore.setState({ servers: [], connections: {}, logs: {}, trusted: [], loadErrors: [] });
  setMcpClient(null);
  return documents;
}
