import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const BAR = "flex items-center justify-between gap-2 px-3 py-1.5 text-sm";

export function Notices() {
  const notice = useUiStore((s) => s.notice);
  const lastError = useWorkspaceStore((s) => s.lastError);
  const loadErrors = useWorkspaceStore((s) => s.loadErrors);

  return (
    <>
      {lastError && (
        <div
          role="alert"
          className={`${BAR} bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`}
        >
          {lastError}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => useWorkspaceStore.getState().clearError()}
          >
            ✕
          </button>
        </div>
      )}
      {loadErrors.length > 0 && (
        <div
          role="alert"
          className={`${BAR} bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200`}
        >
          Skipped {loadErrors.length} unreadable file(s):{" "}
          {loadErrors.map((e) => e.fileName).join(", ")}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className={`${BAR} bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200`}
        >
          {notice}
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => useUiStore.getState().notify(null)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
