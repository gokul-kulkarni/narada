import {
  createMemoryDocumentStore,
  createMemorySecretStore,
  type DocumentStore,
} from "@narada/core/storage/document-store";
import { setAssistClient } from "../lib/assist/client";
import { setMcpClient } from "../lib/mcp/client";
import { resetAssistStore } from "../state/assist-store";
import { resetMcpServerStore } from "../state/mcp-server-store";
import { resetMcpApprovals } from "../state/mcp-approval-store";
import { useMcpActivityStore } from "../state/mcp-activity-store";
import { setNaradaMcpClient } from "../lib/narada-mcp/client";
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
  useTabsStore.setState({ tabs: [], activeTabId: null, closed: [] });
  useHistoryStore.setState({ entries: [] });
  useUiStore.setState({
    view: { kind: "requests" },
    palette: null,
    sidebarHidden: false,
    historyOpen: false,
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
  setAssistClient(undefined);
  resetAssistStore();
  setNaradaMcpClient(undefined);
  resetMcpServerStore();
  resetMcpApprovals();
  useMcpActivityStore.setState({ entries: [] });
  return documents;
}
