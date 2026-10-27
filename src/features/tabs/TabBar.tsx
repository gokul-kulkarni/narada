import { useTabsStore } from "../../state/tabs-store";

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const { activate, close, openNew } = useTabsStore.getState();

  return (
    <div
      role="tablist"
      aria-label="Open requests"
      className="flex items-stretch overflow-x-auto border-b border-neutral-200 text-sm dark:border-neutral-800"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-2 border-r border-neutral-200 px-3 py-1.5 dark:border-neutral-800 ${tab.id === activeTabId ? "bg-neutral-100 dark:bg-neutral-900" : ""}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => activate(tab.id)}
            className="max-w-48 truncate"
          >
            <span className="mr-1 text-xs font-semibold text-orange-600">{tab.request.method}</span>
            {tab.request.name}
            {tab.dirty && <span aria-label="unsaved"> •</span>}
          </button>
          <button
            type="button"
            aria-label={`Close ${tab.request.name}`}
            onClick={() => close(tab.id)}
            className="text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        aria-label="New request tab"
        onClick={openNew}
        className="px-3 hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        +
      </button>
    </div>
  );
}
