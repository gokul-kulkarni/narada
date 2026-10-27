const SIDEBAR_SECTIONS = ["Collections", "Environments", "History"] as const;

function App() {
  return (
    <div className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <aside
        aria-label="Workspace"
        className="w-64 shrink-0 border-r border-neutral-200 p-3 dark:border-neutral-800"
      >
        <h1 className="mb-4 text-sm font-semibold">Free Postman</h1>
        <nav>
          <ul className="space-y-1 text-sm">
            {SIDEBAR_SECTIONS.map((section) => (
              <li
                key={section}
                className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                {section}
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex flex-1 items-center justify-center text-sm text-neutral-500">
        Open or create a request to get started.
      </main>
    </div>
  );
}

export default App;
