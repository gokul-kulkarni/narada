// Narada's sidebar panel: pick a saved request, adjust it, send it. Orca draws the controls; the
// worker (src/worker.ts) reads the collections folder and does the HTTP.
import {
  Callout,
  Collapsible,
  EmptyState,
  Heading,
  IconButton,
  Input,
  read,
  Row,
  Select,
  Separator,
  Skeleton,
  Stack,
  Text,
  Tree,
  set,
  type PanelContext,
} from "orca";
import type { EnvironmentSummary, WorkspaceSnapshot } from "./protocol";
import { requestEditor } from "./panel/request-editor";
import { responseView } from "./panel/response-view";
import {
  environmentId,
  loadWorkspace,
  outcomeFor,
  saveSecret,
  selectedKey,
  selectedRequest,
  workspace,
} from "./panel/state";

/** Orca refuses an empty option value, so "no environment" gets its own. */
const NO_ENVIRONMENT = "none";

export function setup(_ctx: PanelContext): void {
  void loadWorkspace();
}

const FOLDER_SOURCES = {
  setting: "set in this plugin's settings",
  desktop: "chosen in the Narada app",
  default: "the Narada app's default",
} as const;

function environmentPicker(snapshot: WorkspaceSnapshot) {
  const chosen = read(environmentId);
  const known = snapshot.environments.some((e) => e.id === chosen);
  return (
    <Select
      label="Environment"
      value={known && chosen ? chosen : NO_ENVIRONMENT}
      options={[
        { value: NO_ENVIRONMENT, label: "No environment" },
        ...snapshot.environments.map((e) => ({ value: e.id, label: e.name })),
      ]}
      onChange={(value) => set(environmentId, value === NO_ENVIRONMENT ? null : value)}
    />
  );
}

function secretInputs(environment: EnvironmentSummary) {
  if (environment.missingSecrets.length === 0) return null;
  return (
    <Collapsible
      title={`${environment.missingSecrets.length} secret ${
        environment.missingSecrets.length === 1 ? "variable needs" : "variables need"
      } a value`}
      description="Narada keeps secrets in your OS keychain, which this plugin can't read. Values you enter are kept in the plugin's encrypted secrets."
    >
      <Stack gap="xs">
        {environment.missingSecrets.map((key) => (
          <Input
            key={key}
            label={key}
            type="password"
            placeholder="Value, then Enter"
            onSubmit={(value) => void saveSecret(environment.id, key, value)}
          />
        ))}
      </Stack>
    </Collapsible>
  );
}

function folderNotice(snapshot: WorkspaceSnapshot) {
  const { folder, errors } = snapshot;
  if (!folder.exists) {
    return (
      <EmptyState
        icon="folder"
        title="No Narada collections found"
        description={`Looked in ${folder.path} (${FOLDER_SOURCES[folder.source]}). Set the folder that holds Collections/ in Settings → Plugins → Narada.`}
      />
    );
  }
  if (snapshot.tree.length === 0) {
    return (
      <EmptyState
        icon="folder"
        title="No collections yet"
        description={`Create or import a collection in Narada; it reads ${folder.path}.`}
      />
    );
  }
  if (errors.length === 0) return null;
  return (
    <Callout tone="warning" icon="warning" title={`${errors.length} file(s) could not be read`}>
      {errors.map((e) => `${e.fileName}: ${e.message}`).join("\n")}
    </Callout>
  );
}

function workspaceView(snapshot: WorkspaceSnapshot) {
  const request = read(selectedRequest);
  const environment = snapshot.environments.find((e) => e.id === read(environmentId));
  const notice = folderNotice(snapshot);
  if (snapshot.tree.length === 0) return notice;
  return (
    <Stack gap="md">
      {snapshot.environments.length > 0 ? environmentPicker(snapshot) : null}
      {environment ? secretInputs(environment) : null}
      {notice}
      <Tree
        label="Saved requests"
        items={snapshot.tree}
        defaultExpanded={snapshot.tree.map((collection) => collection.key)}
        selected={read(selectedKey) ?? undefined}
        maxHeight="md"
        onSelect={({ key }) => {
          if (snapshot.requests[key]) set(selectedKey, key);
        }}
      />
      <Separator />
      {request ? (
        <Stack gap="md">
          {requestEditor(request)}
          {responseView(outcomeFor(request.key))}
        </Stack>
      ) : (
        <Text muted size="sm">
          Choose a request to send it.
        </Text>
      )}
    </Stack>
  );
}

export default function Panel() {
  const state = read(workspace);
  return (
    <Stack gap="md">
      <Row justify="between" align="center">
        <Heading level={2}>Narada</Heading>
        <IconButton
          icon="refresh"
          label="Reload collections"
          variant="ghost"
          size="sm"
          disabled={state.kind === "loading"}
          onPress={() => void loadWorkspace()}
        />
      </Row>
      {state.kind === "loading" ? <Skeleton lines={4} label="Loading collections" /> : null}
      {state.kind === "failed" ? (
        <Callout tone="danger" icon="error" title="Could not read the collections">
          {state.error}
        </Callout>
      ) : null}
      {state.kind === "ready" ? workspaceView(state.snapshot) : null}
    </Stack>
  );
}
