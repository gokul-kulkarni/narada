import { buildContext } from "../../lib/request-context";
import type { PrepareContext } from "../../lib/prepare-request";
import type { RequestTab } from "../../state/tabs-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";

export function contextForTab(tab: RequestTab): PrepareContext {
  const workspace = useWorkspaceStore.getState();
  return buildContext({
    requestId: tab.source?.requestId ?? null,
    collection: workspace.collections.find((c) => c.id === tab.source?.collectionId),
    environment: selectActiveEnvironment(workspace),
    globals: workspace.globals,
  });
}
