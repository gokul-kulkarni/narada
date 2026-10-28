import { useTabsStore } from "../../state/tabs-store";

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const { activate, close, openNew } = useTabsStore.getState();

  return (
    <div
      role="tablist"
      aria-label="Open requests"
      className="flex items-stretch overflow-x-auto border-b border-line bg-surface text-sm"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-2 border-r border-b-2 border-r-line-soft px-4 py-2 ${
            tab.id === activeTabId
              ? "border-b-accent font-semibold text-ink"
              : "border-b-transparent text-muted hover:text-ink"
          }`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => activate(tab.id)}
            className="max-w-48 truncate"
          >
            <span className="mr-1.5 font-mono text-[11px] font-semibold text-accent-text">
              {tab.request.method}
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
      ))}
      <button
        type="button"
        aria-label="New request tab"
        onClick={openNew}
        className="px-4 text-lg text-muted hover:bg-surface-2 hover:text-ink"
      >
        +
      </button>
    </div>
  );
}
