import { useEffect } from "react";
import { Card } from "../../components/page";
import { Button } from "../../components/ui";
import { getAssistClient } from "../../lib/assist/client";
import { pickFolder } from "../../lib/settings-api";
import { useAssistStore } from "../../state/assist-store";
import { useWorkspaceStore } from "../../state/workspace-store";

const PICK_TITLE = "Choose the project folder the agent may read";

const PATH = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs break-all";

/** One project folder setting: the default (collectionId null) or a collection's. */
function FolderRow({
  label,
  collectionId,
  folder,
  unsetText,
}: {
  label: string;
  collectionId: string | null;
  folder: string | null;
  unsetText: string;
}) {
  const { setFolder } = useAssistStore.getState();
  const choose = async () => {
    const picked = await pickFolder(PICK_TITLE);
    if (picked) await setFolder(collectionId, picked);
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 py-1.5">
      <span className="w-40 shrink-0 truncate text-sm font-semibold">
        {collectionId === null ? "Default" : label.replace("Project folder for ", "")}
      </span>
      {folder ? (
        <code className={PATH}>{folder}</code>
      ) : (
        <span className="text-sm text-muted">{unsetText}</span>
      )}
      <span className="ml-auto flex gap-1">
        <Button onClick={() => void choose()}>Choose…</Button>
        {folder && (
          <Button variant="ghost" onClick={() => void setFolder(collectionId, null)}>
            Clear
          </Button>
        )}
      </span>
    </div>
  );
}

/** Which coding agents Narada found, the preview choice, and the folders agents may read. */
export function AgentSettings() {
  const available = getAssistClient() !== null;
  const { agents, agentsStatus, settings } = useAssistStore();
  const collections = useWorkspaceStore((s) => s.collections);

  useEffect(() => {
    if (!available) return;
    void useAssistStore.getState().detect();
    void useAssistStore.getState().loadSettings();
  }, [available]);

  const description =
    "Ask an installed coding agent about a failed response. It runs read-only, on your own account, with secrets removed from what it is told.";
  if (!available) {
    return (
      <Card label="Agents" title="Agents" description={description}>
        <p className="text-sm text-muted">Asking an agent works only in the desktop app.</p>
      </Card>
    );
  }

  return (
    <Card label="Agents" title="Agents" description={description}>
      <div className="flex flex-wrap items-center gap-2">
        {agentsStatus !== "ready" ? (
          <span className="text-sm text-muted">Looking for agents…</span>
        ) : agents.length === 0 ? (
          <span className="text-sm text-muted">
            No coding agent found. Install Claude Code, then click Refresh.
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {agents.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <b>
                  {agent.name} {agent.version}
                </b>
                <code className={PATH}>{agent.path}</code>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => void useAssistStore.getState().redetect()}
        >
          Refresh
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!settings.skipPreview}
          onChange={(e) => void useAssistStore.getState().setSkipPreview(!e.target.checked)}
        />
        Show what will be sent before each question
      </label>

      <div>
        <h4 className="text-sm font-semibold">Project folders</h4>
        <p className="mb-1 text-sm text-muted">
          The agent can read only this folder, so point it at the code behind the API. Kept on this
          computer only.
        </p>
        <FolderRow
          label="Default project folder"
          collectionId={null}
          folder={settings.defaultFolder}
          unsetText="None: the agent sees only the question"
        />
        {collections.map((collection) => (
          <FolderRow
            key={collection.id}
            label={`Project folder for ${collection.name}`}
            collectionId={collection.id}
            folder={settings.collectionFolders[collection.id] ?? null}
            unsetText="Default"
          />
        ))}
      </div>
    </Card>
  );
}
