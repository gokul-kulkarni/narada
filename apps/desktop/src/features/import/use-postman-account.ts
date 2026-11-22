import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/format";
import { sendHttp } from "../../lib/http-client";
import {
  createPostmanApi,
  POSTMAN_API_KEY_SECRET,
  type PostmanApi,
  type PostmanEntry,
  type PostmanWorkspace,
} from "../../lib/postman-api";
import { getServices } from "../../state/services";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

export interface WorkspaceContents {
  readonly collections: readonly PostmanEntry[];
  readonly environments: readonly PostmanEntry[];
}

export type Selection = ReadonlySet<string>;
export const collectionKey = (uid: string) => `collection:${uid}`;
export const environmentKey = (uid: string) => `environment:${uid}`;

async function loadContents(api: PostmanApi, workspaceId: string): Promise<WorkspaceContents> {
  const [collections, environments] = await Promise.all([
    api.listCollections(workspaceId),
    api.listEnvironments(workspaceId),
  ]);
  return { collections, environments };
}

const revealCollection = ({ id }: { id: string }) => useUiStore.getState().reveal([id]);

async function importSelected(
  api: PostmanApi,
  contents: WorkspaceContents,
  selection: Selection,
): Promise<string> {
  const workspace = useWorkspaceStore.getState();
  const jobs = [
    ...contents.collections
      .filter((c) => selection.has(collectionKey(c.uid)))
      .map((c) => ({
        name: c.name,
        run: async () =>
          workspace.importCollection(await api.getCollection(c.uid)).then(revealCollection),
      })),
    ...contents.environments
      .filter((e) => selection.has(environmentKey(e.uid)))
      .map((e) => ({
        name: e.name,
        run: async () => workspace.importEnvironment(await api.getEnvironment(e.uid)),
      })),
  ];
  // Sequential on purpose: the Postman API rate-limits bursts.
  const failed: string[] = [];
  for (const job of jobs) {
    try {
      await job.run();
    } catch (e) {
      failed.push(`${job.name}: ${errorMessage(e)}`);
    }
  }
  const imported = jobs.length - failed.length;
  if (imported === 0) throw new Error(`Nothing was imported. ${failed.join(" ")}`);
  const summary = `Imported ${imported} item(s) from Postman.`;
  return failed.length > 0 ? `${summary} Failed: ${failed.join(" ")}` : summary;
}

/** State and actions for browsing a Postman account and importing from it. */
export function usePostmanAccount() {
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [api, setApi] = useState<PostmanApi | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly PostmanWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [contents, setContents] = useState<WorkspaceContents | null>(null);
  const [selection, setSelection] = useState<Selection>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServices()
      .secrets.get(POSTMAN_API_KEY_SECRET)
      .then((saved) => saved && setApiKey((current) => current || saved))
      .catch(() => undefined); // No saved key is the normal first-run case.
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openWorkspace = (client: PostmanApi, id: string) =>
    run(async () => {
      setWorkspaceId(id);
      setContents(null);
      setSelection(new Set());
      setContents(await loadContents(client, id));
    });

  const connect = () =>
    run(async () => {
      const key = apiKey.trim();
      const client = createPostmanApi(key, sendHttp);
      const found = await client.listWorkspaces();
      const { secrets } = getServices();
      await (remember
        ? secrets.set(POSTMAN_API_KEY_SECRET, key)
        : secrets.remove(POSTMAN_API_KEY_SECRET));
      setApi(client);
      setWorkspaces(found);
      if (found[0]) {
        setWorkspaceId(found[0].id);
        setContents(await loadContents(client, found[0].id));
      }
    });

  const toggle = (key: string) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const importNow = (onDone: (message: string) => void) =>
    run(async () => {
      if (api && contents) onDone(await importSelected(api, contents, selection));
    });

  return {
    apiKey,
    setApiKey,
    remember,
    setRemember,
    connected: api !== null,
    workspaces,
    workspaceId,
    selectWorkspace: (id: string) => api && void openWorkspace(api, id),
    contents,
    selection,
    toggle,
    busy,
    error,
    connect: () => void connect(),
    importNow: (onDone: (message: string) => void) => void importNow(onDone),
  };
}
