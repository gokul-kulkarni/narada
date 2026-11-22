import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const BAR =
  "mx-5 mt-3 flex items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-semibold";

export function Notices() {
  const notice = useUiStore((s) => s.notice);
  const lastError = useWorkspaceStore((s) => s.lastError);
  const loadErrors = useWorkspaceStore((s) => s.loadErrors);

  return (
    <>
      {lastError && (
        <div role="alert" className={`${BAR} bg-err-soft text-err`}>
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
        <div role="alert" className={`${BAR} bg-warn-soft text-warn`}>
          Skipped {loadErrors.length} unreadable file(s):{" "}
          {loadErrors.map((e) => e.fileName).join(", ")}
        </div>
      )}
      {notice && (
        <div role="status" className={`${BAR} bg-ok-soft text-ok`}>
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
