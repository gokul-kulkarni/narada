import { upsertRequest } from "../../lib/collection-tree";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

/** Saves a tab back to its collection, or asks where to save it if it has none. */
export async function saveTab(tab: RequestTab): Promise<void> {
  const workspace = useWorkspaceStore.getState();
  const source = tab.source;
  if (!source || !workspace.collections.some((c) => c.id === source.collectionId)) {
    useUiStore.getState().openDialog({ kind: "save", tabId: tab.id });
    return;
  }
  await workspace.updateCollection(source.collectionId, (c) => upsertRequest(c, tab.request, null));
  useTabsStore.getState().patchTab(tab.id, { dirty: false });
}
