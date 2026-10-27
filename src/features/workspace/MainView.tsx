import { useUiStore } from "../../state/ui-store";
import { CollectionSettings } from "../collections/CollectionSettings";
import { EnvironmentEditor, GlobalsEditor } from "../environments/EnvironmentEditor";
import { RunnerView } from "../runner/RunnerView";
import { SettingsView } from "../settings/SettingsView";
import { RequestWorkspace } from "./RequestWorkspace";

export function MainView() {
  const view = useUiStore((s) => s.view);
  switch (view.kind) {
    case "requests":
      return <RequestWorkspace />;
    case "collection":
      return <CollectionSettings id={view.id} />;
    case "environment":
      return <EnvironmentEditor id={view.id} />;
    case "globals":
      return <GlobalsEditor />;
    case "settings":
      return <SettingsView />;
    case "runner":
      return (
        <RunnerView
          key={`${view.collectionId}:${view.folderId}`}
          collectionId={view.collectionId}
          folderId={view.folderId}
        />
      );
  }
}
