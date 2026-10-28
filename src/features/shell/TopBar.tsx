import { Button } from "../../components/ui";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { DeliverTo } from "../environments/EnvironmentsPanel";

function Breadcrumb() {
  const tab = useTabsStore(selectActiveTab);
  const collectionName = useWorkspaceStore(
    (s) => s.collections.find((c) => c.id === tab?.source?.collectionId)?.name,
  );
  if (!tab) return null;
  return (
    <span className="min-w-0 truncate text-sm text-muted">
      {collectionName ? `${collectionName} › ` : "Unsaved › "}
      <b className="text-ink">{tab.request.name}</b>
    </span>
  );
}

export function TopBar() {
  const { show, openDialog } = useUiStore.getState();
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-surface px-5">
      <h1 className="font-display text-xl font-bold text-accent-text">
        <button type="button" onClick={() => show({ kind: "requests" })}>
          Narada
        </button>
      </h1>
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-2">
        <DeliverTo />
        <Button onClick={() => openDialog({ kind: "import" })}>Import</Button>
        <Button aria-label="Settings" onClick={() => show({ kind: "settings" })}>
          ⚙
        </Button>
      </div>
    </header>
  );
}
