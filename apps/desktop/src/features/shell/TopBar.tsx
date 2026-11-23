import { Button } from "../../components/ui";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { DeliverTo } from "../environments/EnvironmentsPanel";
import { formatKeys } from "../shortcuts/keys";

function Breadcrumb() {
  const tab = useTabsStore(selectActiveTab);
  const collectionName = useWorkspaceStore(
    (s) => s.collections.find((c) => c.id === tab?.source?.collectionId)?.name,
  );
  const onRequests = useUiStore((s) => s.view.kind === "requests");
  if (!tab || !onRequests) return null;
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
      <button
        type="button"
        onClick={() => useUiStore.getState().openPalette("requests")}
        className="ml-auto flex w-64 items-center justify-between rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-ink"
      >
        Go to request…
        <kbd className="font-mono text-xs">{formatKeys("mod+p")}</kbd>
      </button>
      <div className="flex items-center gap-2">
        <DeliverTo />
        <Button onClick={() => openDialog({ kind: "import" })}>Import</Button>
        <Button
          aria-label="Settings"
          title={`Settings (${formatKeys("mod+,")})`}
          onClick={() => show({ kind: "settings" })}
        >
          ⚙
        </Button>
      </div>
    </header>
  );
}
