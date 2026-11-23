import { z } from "zod";
import {
  applyPatch,
  describeChanges,
  parsePatch,
  type RequestBodyPatch,
  type RequestChange,
  type RequestPatch,
} from "../assist/patch";
import { findRequest, updateRequestInCollection } from "../collection-tree";
import type { Collection, HttpRequestDef } from "../model";
import { SecretGuard } from "./secret-guard";
import { workspaceSecrets, type ToolWorkspace } from "./tools";

/** A change to one saved request, worked out so the user can approve the exact diff. */
export interface UpdatePlan {
  readonly collectionId: string;
  readonly collectionName: string;
  readonly requestId: string;
  readonly requestName: string;
  readonly before: HttpRequestDef;
  readonly after: HttpRequestDef;
  readonly changes: readonly RequestChange[];
  /** Parts left as they were because they held values the agent never saw. */
  readonly warnings: readonly string[];
  /** Variables put in place of literal secrets. */
  readonly replacedSecrets: readonly string[];
}

export type UpdateResult = { readonly plan: UpdatePlan } | { readonly error: string };

const updateArgs = z.object({
  requestId: z.string().min(1),
  changes: z.record(z.string(), z.unknown()),
});

const REDACTED = "[redacted]";

/** Literal secrets in the changes become variables; values the agent saw hidden stay hidden. */
function guardPatch(patch: RequestPatch, guard: SecretGuard): RequestPatch {
  const field = (key: string, value: string) =>
    value.includes(REDACTED) ? value : guard.field(key, value);
  const body = (b: RequestBodyPatch): RequestBodyPatch => {
    if (b.mode === "none") return b;
    if (b.mode === "raw") return { ...b, raw: guard.text(b.raw) };
    return { ...b, fields: b.fields.map((f) => ({ key: f.key, value: field(f.key, f.value) })) };
  };
  return {
    ...patch,
    ...(patch.url !== undefined ? { url: guard.text(patch.url) } : {}),
    ...(patch.headers
      ? { headers: patch.headers.map((h) => ({ key: h.key, value: field(h.key, h.value) })) }
      : {}),
    ...(patch.body ? { body: body(patch.body) } : {}),
  };
}

/** Plans `update_request`: method, URL, headers or body of one saved HTTP request. */
export function planUpdate(workspace: ToolWorkspace, args: unknown): UpdateResult {
  const parsed = updateArgs.safeParse(args);
  if (!parsed.success) return { error: "Give requestId and changes." };
  const { requestId, changes } = parsed.data;
  const collection = workspace.collections.find((c) => findRequest(c, requestId));
  const found = collection && findRequest(collection, requestId);
  if (!collection || !found) {
    return { error: `No saved request with id "${requestId}". Use list_collections to find one.` };
  }
  const before = found.request;
  if (before.protocol !== "http") return { error: "Only HTTP requests can be changed this way." };

  const { patch, warnings } = parsePatch(changes);
  if (!patch) return { error: "The changes couldn't be read, so they can't be applied." };
  const guard = new SecretGuard(workspaceSecrets(workspace));
  const after = applyPatch(before, guardPatch(patch, guard));
  const diff = describeChanges(before, after);
  if (diff.length === 0) return { error: "That would not change the request." };
  return {
    plan: {
      collectionId: collection.id,
      collectionName: collection.name,
      requestId,
      requestName: before.name,
      before,
      after,
      changes: diff,
      warnings,
      replacedSecrets: [...guard.introduced].sort(),
    },
  };
}

/** The collection with the planned request replaced; a new object. */
export const applyUpdate = (collection: Collection, plan: UpdatePlan): Collection =>
  updateRequestInCollection(collection, plan.requestId, () => plan.after);
