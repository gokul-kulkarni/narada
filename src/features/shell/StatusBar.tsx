import { useDriveStatus } from "../../hooks/use-drive-status";
import { driveAvailable } from "../../lib/drive-api";
import { useUiStore } from "../../state/ui-store";
import { syncNow } from "../settings/sync-now";

const LINK = "font-semibold text-accent-text hover:underline";

function DriveState() {
  const status = useDriveStatus();
  if (!driveAvailable()) return <span>Saved in this browser</span>;
  if (status?.signedIn) {
    return (
      <span>
        ● Syncs with Google Drive ·{" "}
        <button type="button" className={LINK} onClick={() => void syncNow()}>
          Sync now
        </button>
      </span>
    );
  }
  return (
    <span>
      Saved on this computer ·{" "}
      <button
        type="button"
        className={LINK}
        onClick={() => useUiStore.getState().show({ kind: "settings" })}
      >
        Connect Google Drive
      </button>
    </span>
  );
}

export function StatusBar() {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-5 border-t border-line bg-surface px-5 text-xs text-muted">
      <DriveState />
      {driveAvailable() && <span>Secrets stay in your system keychain</span>}
    </footer>
  );
}
