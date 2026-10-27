import { findRequest } from "../../lib/collection-tree";
import { newId } from "../../lib/ids";
import type { KeyValue } from "../../lib/model";
import type { PipelineInput } from "../../lib/scripts/pipeline";
import { buildContext } from "../../lib/request-context";
import type { VariableMap, VariableScopes } from "../../lib/variables";
import type { RequestTab } from "../../state/tabs-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";

export function pipelineInputFor(
  collectionId: string | null,
  requestId: string | null,
  extra: { data?: VariableMap; iteration?: number } = {},
): Omit<PipelineInput, "request"> {
  const workspace = useWorkspaceStore.getState();
  const collection = workspace.collections.find((c) => c.id === collectionId);
  const context = buildContext({
    requestId,
    collection,
    environment: selectActiveEnvironment(workspace),
    globals: workspace.globals,
    data: extra.data,
  });
  const inCollection =
    collection && requestId ? findRequest(collection, requestId) !== undefined : false;
  return {
    ...context,
    iteration: extra.iteration,
    collectionScripts:
      collection && (inCollection || !requestId)
        ? { preRequest: collection.preRequestScript, test: collection.testScript }
        : undefined,
  };
}

export const inputForTab = (tab: RequestTab) =>
  pipelineInputFor(tab.source?.collectionId ?? null, tab.source?.requestId ?? null);

const changed = (a: VariableMap, b: VariableMap) => JSON.stringify(a) !== JSON.stringify(b);

/** Rewrites rows to match `next`, keeping disabled rows, row ids and (via `extend`) extra fields. */
export function mergeRows<T extends KeyValue>(
  rows: readonly T[],
  next: VariableMap,
  extend: (row: KeyValue) => T,
): T[] {
  const kept = rows.flatMap((row) => {
    if (!row.enabled) return [row];
    return Object.hasOwn(next, row.key) ? [{ ...row, value: next[row.key] }] : [];
  });
  const known = new Set(rows.filter((r) => r.enabled).map((r) => r.key));
  const added = Object.entries(next)
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => extend({ id: newId(), key, value, enabled: true }));
  return [...kept, ...added];
}

/** Persists variables that scripts changed into the active environment, the collection and globals. */
export async function applyScopes(
  collectionId: string | null,
  before: VariableScopes,
  after: VariableScopes,
): Promise<void> {
  const workspace = useWorkspaceStore.getState();
  const environment = selectActiveEnvironment(workspace);
  const writes: Promise<void>[] = [];
  if (environment && changed(before.environment, after.environment)) {
    writes.push(
      workspace.updateEnvironment(environment.id, (e) => ({
        ...e,
        variables: mergeRows(e.variables, after.environment, (row) => ({ ...row, secret: false })),
      })),
    );
  }
  if (collectionId && changed(before.collection, after.collection)) {
    writes.push(
      workspace.updateCollection(collectionId, (c) => ({
        ...c,
        variables: mergeRows(c.variables, after.collection, (row) => row),
      })),
    );
  }
  if (changed(before.global, after.global)) {
    writes.push(workspace.setGlobals(mergeRows(workspace.globals, after.global, (row) => row)));
  }
  await Promise.all(writes);
}
