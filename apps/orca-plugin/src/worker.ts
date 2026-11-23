// Narada's worker: reads the collections folder and sends requests with @narada/core. Orca runs
// the bundle (dist/worker.js, built by `pnpm build`), since core is a workspace package.
import type { SecretStore } from "@narada/core/storage/document-store";
import { GLOBALS_FILE, parseGlobals } from "@narada/core/storage/globals";
import {
  loadCollections,
  loadEnvironments,
  secretKey,
} from "@narada/core/storage/workspace-repository";
import type { OrcaWorkerApi } from "orca/worker";
import type { WorkspaceSnapshot } from "./protocol";
import { createFromCurl } from "./worker/create";
import { createFsDocumentStore } from "./worker/fs-store";
import { currentPlatform, desktopDirs, resolveFolder } from "./worker/paths";
import { sendSaved, type LoadedWorkspace } from "./worker/send";
import { buildSnapshot } from "./worker/snapshot";
import type { TlsSettings } from "./worker/tls";

/** Orca waits at most 120 s for a panel request; leave room to answer. */
const MAX_TIMEOUT_SECONDS = 110;
const DEFAULT_TIMEOUT_SECONDS = 30;

/** Secret variables kept in the plugin's encrypted secrets, under the desktop app's key names. */
const pluginSecrets = (orca: OrcaWorkerApi): SecretStore => ({
  get: (key) => orca.secrets.get(key),
  set: (key, value) => orca.secrets.set(key, value),
  remove: (key) => orca.secrets.delete(key),
});

async function stringSetting(orca: OrcaWorkerApi, key: string): Promise<string | null> {
  const value = await orca.settings.get(key);
  return typeof value === "string" ? value : null;
}

async function tlsSettings(orca: OrcaWorkerApi): Promise<TlsSettings> {
  const verify = await orca.settings.get("verifyTls");
  return {
    verify: verify !== false,
    caFile: (await stringSetting(orca, "caCertificatesFile")) ?? "",
  };
}

async function timeoutMs(orca: OrcaWorkerApi): Promise<number> {
  const value = await orca.settings.get("timeoutSeconds");
  const seconds = typeof value === "number" && value > 0 ? value : DEFAULT_TIMEOUT_SECONDS;
  return Math.min(seconds, MAX_TIMEOUT_SECONDS) * 1000;
}

async function openFolder(orca: OrcaWorkerApi) {
  const platform = currentPlatform();
  const dirs = desktopDirs(platform);
  const folder = await resolveFolder(
    await stringSetting(orca, "collectionsFolder"),
    dirs,
    platform.home,
  );
  return { folder, store: createFsDocumentStore(folder.path, dirs.dataDir) };
}

async function load(
  orca: OrcaWorkerApi,
): Promise<{ snapshot: WorkspaceSnapshot; workspace: LoadedWorkspace }> {
  const { folder, store } = await openFolder(orca);
  const [collections, environments, globals] = await Promise.all([
    loadCollections(store),
    loadEnvironments(store, pluginSecrets(orca)),
    store.readLocal(GLOBALS_FILE).catch(() => null),
  ]);
  const workspace: LoadedWorkspace = {
    collections: collections.items,
    environments: environments.items,
    globals: parseGlobals(globals),
  };
  const errors = [...collections.errors, ...environments.errors];
  return {
    snapshot: buildSnapshot(folder, workspace.collections, workspace.environments, errors),
    workspace,
  };
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle("workspace.load", async () => (await load(orca)).snapshot);

  // Reloads on every send, so edits made in Narada (or synced from Drive) apply at once.
  orca.panels.handle("request.send", async (input, { signal }) => {
    const { workspace } = await load(orca);
    return sendSaved(workspace, input, {
      signal,
      timeoutMs: await timeoutMs(orca),
      tls: await tlsSettings(orca),
    });
  });

  orca.panels.handle("request.create", async (input) =>
    createFromCurl((await openFolder(orca)).store, input),
  );

  orca.panels.handle("secret.set", async ({ environmentId, key, value }) => {
    await orca.secrets.set(secretKey(environmentId, key), value);
    return { ok: true as const };
  });
}
