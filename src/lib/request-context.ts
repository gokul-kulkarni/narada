import { findRequest } from "./collection-tree";
import type { Collection, Environment, KeyValue } from "./model";
import type { PrepareContext } from "./prepare-request";
import type { VariableMap, VariableScopes } from "./variables";

export const toVariableMap = (rows: readonly KeyValue[]): VariableMap =>
  Object.fromEntries(
    rows.filter((row) => row.enabled && row.key).map((row) => [row.key, row.value]),
  );

export interface ContextInput {
  readonly requestId: string | null;
  readonly collection: Collection | undefined;
  readonly environment: Environment | undefined;
  readonly globals: readonly KeyValue[];
  readonly data?: VariableMap;
  readonly local?: VariableMap;
}

export function buildScopes(input: ContextInput): VariableScopes {
  return {
    global: toVariableMap(input.globals),
    collection: toVariableMap(input.collection?.variables ?? []),
    environment: toVariableMap(input.environment?.variables ?? []),
    data: input.data ?? {},
    local: input.local ?? {},
  };
}

/** Saved requests inherit auth from their folders and collection; unsaved ones only from the collection. */
export function buildContext(input: ContextInput): PrepareContext {
  const found =
    input.collection && input.requestId
      ? findRequest(input.collection, input.requestId)
      : undefined;
  const authChain = found?.authChain ?? (input.collection ? [input.collection.auth] : []);
  return { scopes: buildScopes(input), authChain };
}
