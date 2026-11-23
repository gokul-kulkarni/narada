import { CommandPalette } from "./features/shortcuts/CommandPalette";
import { useShortcuts } from "./features/shortcuts/use-shortcuts";
import { Dialogs } from "./features/workspace/Dialogs";
import { MainView } from "./features/workspace/MainView";
import { Notices } from "./features/workspace/Notices";
import { Sidebar } from "./features/shell/Sidebar";
import { StatusBar } from "./features/shell/StatusBar";
import { TopBar } from "./features/shell/TopBar";
import { useBootstrap } from "./hooks/use-bootstrap";
import { useFileDrop } from "./hooks/use-file-drop";
import { useUiStore } from "./state/ui-store";
import { useWorkspaceStore } from "./state/workspace-store";

function App() {
  useBootstrap();
  useFileDrop();
  useShortcuts();
  const sidebarHidden = useUiStore((s) => s.sidebarHidden);
  const loaded = useWorkspaceStore((s) => s.loaded);

  // Nothing is editable until the workspace has loaded, so a late load can't overwrite user changes.
  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-sm text-muted">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-canvas font-sans text-ink">
      <TopBar />
      <Notices />
      <div className="flex min-h-0 flex-1">
        {!sidebarHidden && <Sidebar />}
        <main className="flex min-w-0 flex-1 flex-col">
          <MainView />
        </main>
      </div>
      <StatusBar />
      <Dialogs />
      <CommandPalette />
    </div>
  );
}

export default App;
