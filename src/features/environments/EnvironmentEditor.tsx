import { Button, EmptyState, TextInput } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { exportTextFile, safeExportName } from "../../lib/export-file";
import type { Environment } from "../../lib/model";
import { toPostmanEnvironment } from "../../lib/postman/environment";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { KeyValueEditor } from "../request/KeyValueEditor";
import { VariablesEditor } from "./VariablesEditor";

async function exportEnvironment(environment: Environment) {
  // Secret values are exported blank, matching what is written to the synced folder.
  const redacted = {
    ...environment,
    variables: environment.variables.map((v) => (v.secret ? { ...v, value: "" } : v)),
  };
  try {
    const content = JSON.stringify(toPostmanEnvironment(redacted), null, 2);
    if (
      await exportTextFile(safeExportName(environment.name, ".postman_environment.json"), content)
    ) {
      useUiStore.getState().notify(`Exported "${environment.name}" (secret values left blank).`);
    }
  } catch (error) {
    useUiStore.getState().notify(`Export failed: ${errorMessage(error)}`);
  }
}

export function EnvironmentEditor({ id }: { id: string }) {
  const environment = useWorkspaceStore((s) => s.environments.find((e) => e.id === id));
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  const { updateEnvironment, deleteEnvironment, setActiveEnvironment } =
    useWorkspaceStore.getState();
  if (!environment) return <EmptyState>This environment no longer exists.</EmptyState>;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <TextInput
          aria-label="Environment name"
          className="flex-1 text-base font-medium"
          value={environment.name}
          onChange={(e) => void updateEnvironment(id, (env) => ({ ...env, name: e.target.value }))}
        />
        <Button onClick={() => setActiveEnvironment(activeId === id ? null : id)}>
          {activeId === id ? "Deactivate" : "Set active"}
        </Button>
        <Button onClick={() => void exportEnvironment(environment)}>Export</Button>
        <Button
          variant="danger"
          onClick={() => {
            useUiStore.getState().show({ kind: "requests" });
            void deleteEnvironment(id);
          }}
        >
          Delete
        </Button>
      </div>
      <VariablesEditor
        rows={environment.variables}
        onChange={(variables) => void updateEnvironment(id, (env) => ({ ...env, variables }))}
      />
      <p className="text-xs text-neutral-500">
        Changes save automatically. Use variables in requests as {"{{name}}"}.
      </p>
    </div>
  );
}

export function GlobalsEditor() {
  const globals = useWorkspaceStore((s) => s.globals);
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-base font-medium">Globals</h2>
      <p className="text-xs text-neutral-500">
        Available in every request. Stored on this machine only (not synced).
      </p>
      <KeyValueEditor
        label="Global variables"
        rows={globals}
        onChange={(rows) => void useWorkspaceStore.getState().setGlobals(rows)}
      />
    </div>
  );
}
