import { Button, EmptyState, SectionHeading, Select, join } from "../../components/ui";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const ROW = "w-full rounded-lg px-2 py-1 text-left hover:bg-surface-2";

export function EnvironmentsPanel() {
  const environments = useWorkspaceStore((s) => s.environments);
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  const { show } = useUiStore.getState();

  return (
    <section aria-label="Environments">
      <div className="mb-1 flex items-center justify-between">
        <SectionHeading>Environments</SectionHeading>
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
            Globals
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
              {env.id === activeId && <span className="ml-2 text-xs text-ok">active</span>}
            </button>
          </li>
        ))}
      </ul>
      {environments.length === 0 && <EmptyState>No environments yet.</EmptyState>}
    </section>
  );
}

/** Segmented buttons read faster than a dropdown, until there are too many environments. */
export const SEGMENTED_ENVIRONMENT_LIMIT = 4;

const SEGMENT = "rounded-md px-3 py-1 text-sm transition-colors";

export function DeliverTo() {
  const environments = useWorkspaceStore((s) => s.environments);
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  const select = (id: string | null) => useWorkspaceStore.getState().setActiveEnvironment(id);

  if (environments.length > SEGMENTED_ENVIRONMENT_LIMIT) {
    return (
      <label className="flex items-center gap-2 text-sm font-semibold text-muted">
        Deliver to
        <Select
          aria-label="Deliver to"
          value={activeId ?? ""}
          onChange={(e) => select(e.target.value || null)}
        >
          <option value="">No environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </Select>
      </label>
    );
  }

  const options = [{ id: null, name: "None" }, ...environments];
  return (
    <div
      role="group"
      aria-label="Deliver to"
      className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
    >
      <span className="px-2 text-xs font-semibold text-muted">Deliver to</span>
      {options.map((env) => {
        const pressed = env.id === activeId;
        return (
          <button
            key={env.id ?? "none"}
            type="button"
            aria-pressed={pressed}
            onClick={() => select(env.id)}
            className={join(
              SEGMENT,
              pressed ? "bg-surface font-bold shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {env.name}
          </button>
        );
      })}
    </div>
  );
}
