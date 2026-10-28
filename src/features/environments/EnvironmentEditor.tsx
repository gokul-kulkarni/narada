import { Card, Page, PAGE_TITLE, TITLE_INPUT } from "../../components/page";
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

  const active = activeId === id;

  return (
    <Page
      eyebrow={
        <>
          Environment
          {active && (
            <span className="ml-2 rounded-full bg-ok-soft px-2 py-0.5 text-ok">
              Delivering here
            </span>
          )}
        </>
      }
      title={
        <TextInput
          aria-label="Environment name"
          className={TITLE_INPUT}
          value={environment.name}
          onChange={(e) => void updateEnvironment(id, (env) => ({ ...env, name: e.target.value }))}
        />
      }
      actions={
        <>
          <Button
            variant={active ? "secondary" : "primary"}
            onClick={() => setActiveEnvironment(active ? null : id)}
          >
            {active ? "Deactivate" : "Set active"}
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
        </>
      }
    >
      <Card
        label="Variables"
        title="Variables"
        description={
          <>
            Use them in requests as {"{{name}}"}. Secret values stay in your system keychain and are
            never synced. Changes save automatically.
          </>
        }
      >
        <VariablesEditor
          rows={environment.variables}
          onChange={(variables) => void updateEnvironment(id, (env) => ({ ...env, variables }))}
        />
      </Card>
    </Page>
  );
}

export function GlobalsEditor() {
  const globals = useWorkspaceStore((s) => s.globals);
  return (
    <Page eyebrow="Everywhere" title={<h2 className={PAGE_TITLE}>Globals</h2>}>
      <Card
        label="Global variables"
        title="Variables"
        description="Available in every request. Stored on this machine only (not synced)."
      >
        <KeyValueEditor
          label="Global variables"
          rows={globals}
          onChange={(rows) => void useWorkspaceStore.getState().setGlobals(rows)}
        />
      </Card>
    </Page>
  );
}
