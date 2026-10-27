import { Button, EmptyState, Select } from "../../components/ui";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const ROW = "w-full rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900";

export function EnvironmentsPanel() {
  const environments = useWorkspaceStore((s) => s.environments);
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  const { show } = useUiStore.getState();

  return (
    <section aria-label="Environments">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Environments
        </h2>
        <Button
          variant="ghost"
          className="px-2 py-0.5"
          onClick={() =>
            show({ kind: "environment", id: useWorkspaceStore.getState().createEnvironment().id })
          }
        >
          + New
        </Button>
      </div>
      <ul className="text-sm">
        <li>
          <button type="button" className={ROW} onClick={() => show({ kind: "globals" })}>
            🌐 Globals
          </button>
        </li>
        {environments.map((env) => (
          <li key={env.id}>
            <button
              type="button"
              className={ROW}
              onClick={() => show({ kind: "environment", id: env.id })}
            >
              {env.name}
              {env.id === activeId && <span className="ml-2 text-xs text-green-600">active</span>}
            </button>
          </li>
        ))}
      </ul>
      {environments.length === 0 && <EmptyState>No environments yet.</EmptyState>}
    </section>
  );
}

export function EnvironmentSelector() {
  const environments = useWorkspaceStore((s) => s.environments);
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  return (
    <Select
      aria-label="Active environment"
      value={activeId ?? ""}
      onChange={(e) => useWorkspaceStore.getState().setActiveEnvironment(e.target.value || null)}
    >
      <option value="">No environment</option>
      {environments.map((env) => (
        <option key={env.id} value={env.id}>
          {env.name}
        </option>
      ))}
    </Select>
  );
}
