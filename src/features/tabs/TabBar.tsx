import { useTabsStore } from "../../state/tabs-store";

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const { activate, close, openNew } = useTabsStore.getState();

  return (
    <div
      role="tablist"
      aria-label="Open requests"
      className="flex items-stretch overflow-x-auto border-b border-line text-sm"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-2 border-r border-line px-3 py-1.5 ${tab.id === activeTabId ? "bg-surface-2" : ""}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => activate(tab.id)}
            className="max-w-48 truncate"
          >
            <span className="mr-1 text-xs font-semibold text-accent-text">
              {tab.request.method}
            </span>
            {tab.request.name}
            {tab.dirty && <span aria-label="unsaved"> •</span>}
          </button>
          <button
            type="button"
            aria-label={`Close ${tab.request.name}`}
            onClick={() => close(tab.id)}
            className="text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="New request tab"
        onClick={openNew}
        className="px-3 hover:bg-surface-2"
      >
        +
      </button>
    </div>
  );
}
