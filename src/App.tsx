import { Button } from "./components/ui";
import { CollectionsPanel } from "./features/collections/CollectionsPanel";
import { EnvironmentSelector, EnvironmentsPanel } from "./features/environments/EnvironmentsPanel";
import { HistoryList } from "./features/history/HistoryList";
import { Dialogs } from "./features/workspace/Dialogs";
import { syncNow } from "./features/settings/sync-now";
import { MainView } from "./features/workspace/MainView";
import { Notices } from "./features/workspace/Notices";
import { useBootstrap } from "./hooks/use-bootstrap";
import { useFileDrop } from "./hooks/use-file-drop";
import { driveAvailable } from "./lib/drive-api";
import { useUiStore } from "./state/ui-store";
import { useWorkspaceStore } from "./state/workspace-store";

function App() {
  useBootstrap();
  useFileDrop();
  const loaded = useWorkspaceStore((s) => s.loaded);
  const { show, openDialog } = useUiStore.getState();

  // Nothing is editable until the workspace has loaded, so a late load can't overwrite user changes.
  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-500">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h1 className="mr-auto text-sm font-semibold">
          <button type="button" onClick={() => show({ kind: "requests" })}>
            Narada
          </button>
        </h1>
        {driveAvailable() && (
          <Button title="Sync with Google Drive" onClick={() => void syncNow()}>
            ⟳ Sync
          </Button>
        )}
        <Button onClick={() => openDialog({ kind: "import" })}>Import</Button>
        <EnvironmentSelector />
        <Button aria-label="Settings" onClick={() => show({ kind: "settings" })}>
          ⚙
        </Button>
      </header>
      <Notices />
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Workspace"
          className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-neutral-200 p-3 dark:border-neutral-800"
        >
          <CollectionsPanel />
          <EnvironmentsPanel />
          <section aria-label="History">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              History
            </h2>
            <HistoryList />
          </section>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <MainView />
        </main>
      </div>
      <Dialogs />
    </div>
  );
}

export default App;
