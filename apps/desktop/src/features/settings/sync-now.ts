import { summarizeSync, syncDrive } from "../../lib/drive-api";
import { errorMessage } from "../../lib/format";
import { useMcpStore } from "../../state/mcp-store";
import { useUiStore } from "../../state/ui-store";
import { flushWrites, useWorkspaceStore } from "../../state/workspace-store";

export async function syncNow(): Promise<void> {
  const { notify } = useUiStore.getState();
  notify("Syncing with Google Drive…");
  try {
    await flushWrites();
    const report = await syncDrive();
    await Promise.all([useWorkspaceStore.getState().load(), useMcpStore.getState().load()]);
    notify(summarizeSync(report));
  } catch (error) {
    notify(`Sync failed: ${errorMessage(error)}`);
  }
}
