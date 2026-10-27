import { HistoryList } from "./features/history/HistoryList";
import { RequestWorkspace } from "./features/workspace/RequestWorkspace";

function App() {
  return (
    <div className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <aside
        aria-label="Workspace"
        className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-neutral-200 p-3 dark:border-neutral-800"
      >
        <h1 className="text-sm font-semibold">Free Postman</h1>
        <section aria-label="History">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            History
          </h2>
          <HistoryList />
        </section>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <RequestWorkspace />
      </main>
    </div>
  );
}

export default App;
