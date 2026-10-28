import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { CollectionsPanel } from "../collections/CollectionsPanel";
import { EnvironmentsPanel } from "../environments/EnvironmentsPanel";

export function Sidebar() {
  // An empty workspace already offers import in the collections panel; don't ask twice.
  const hasCollections = useWorkspaceStore((s) => s.collections.length > 0);
  return (
    <aside
      aria-label="Workspace"
      className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-canvas p-4"
    >
      <CollectionsPanel />
      <EnvironmentsPanel />
      {hasCollections && (
        <button
          type="button"
          onClick={() => useUiStore.getState().openDialog({ kind: "import" })}
          className="mt-auto rounded-xl border-[1.5px] border-dashed border-line p-3 text-left text-sm font-bold text-accent-text hover:border-accent"
        >
          Bring messages from Postman →
          <span className="mt-1 block text-xs font-normal text-muted">
            Drop exported files anywhere, or connect your account.
          </span>
        </button>
      )}
    </aside>
  );
}
