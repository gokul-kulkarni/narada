import { requestBadge } from "../../protocols/registry";
import { openBlankMcpRequest } from "../mcp/open-request";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";

/** Runs a tab action, then shows the requests: the tab bar is also on Settings and other screens. */
const toRequests = (action: () => unknown) => () => {
  action();
  useUiStore.getState().show({ kind: "requests" });
};

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const onRequests = useUiStore((s) => s.view.kind === "requests");
  const { activate, close, openNew } = useTabsStore.getState();

  return (
    <div
      role="tablist"
      aria-label="Open requests"
      className="flex items-stretch overflow-x-auto border-b border-line bg-surface text-sm"
    >
      {tabs.map((tab) => {
        // Away from the requests, no tab is current: the highlight would suggest it is on screen.
        const current = onRequests && tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            // Middle-click closes, as in browsers and VS Code.
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              close(tab.id);
            }}
            className={`group flex items-center gap-2 border-r border-b-2 border-r-line-soft px-4 py-2 ${
              current
                ? "border-b-accent font-semibold text-ink"
                : "border-b-transparent text-muted hover:text-ink"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={current}
              onClick={toRequests(() => activate(tab.id))}
              className="max-w-48 truncate"
            >
              <span className="mr-1.5 font-mono text-[11px] font-semibold text-accent-text">
                {requestBadge(tab.request)}
              </span>
              {tab.request.name}
              {tab.dirty && (
                <span aria-label="unsaved" className="text-send">
                  {" "}
                  •
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.request.name}`}
              onClick={() => close(tab.id)}
              className="rounded px-1 text-muted opacity-60 group-hover:opacity-100 hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label="New request tab"
        onClick={toRequests(openNew)}
        className="px-4 text-lg text-muted hover:bg-surface-2 hover:text-ink"
      >
        +
      </button>
      <button
        type="button"
        aria-label="New MCP request tab"
        title="New MCP request"
        onClick={toRequests(openBlankMcpRequest)}
        className="px-3 font-mono text-[11px] font-semibold text-muted hover:bg-surface-2 hover:text-ink"
      >
        + MCP
      </button>
    </div>
  );
}
