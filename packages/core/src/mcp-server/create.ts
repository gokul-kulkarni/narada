import { z } from "zod";
import { bodySchema, pairSchema, type RequestBodyPatch } from "../assist/patch";
import { isSensitiveName, maskValue } from "../assist/scrub";
import { newCollection, newKeyValue, newRequest } from "../factories";
import { newId } from "../ids";
import {
  HTTP_METHODS,
  type Collection,
  type CollectionItem,
  type HttpRequestDef,
  type KeyValue,
  type RequestBody,
} from "../model";
import { workspaceSecrets, type ToolWorkspace } from "./tools";
import { SecretGuard } from "./secret-guard";

/**
 * What a create tool will do, worked out before anything changes so the user can approve it.
 * Only ever adds: existing requests, folders and collections are never changed.
 */
export interface CreatePlan {
  readonly kind: "requests" | "folder" | "collection";
  /** `id` null: a new collection with this name. */
  readonly collection: { readonly id: string | null; readonly name: string };
  /** Folder names from the collection root to where things are added. */
  readonly folderPath: readonly string[];
  /** The tail of `folderPath` that does not exist yet. */
  readonly newFolders: readonly string[];
  readonly requests: readonly PlannedRequest[];
  /** Variables of a new collection. */
  readonly variables: readonly KeyValue[];
  /** Variables put in place of literal secrets, which the user still has to set. */
  readonly replacedSecrets: readonly string[];
  /** `{{variables}}` used that no scope defines yet. */
  readonly missingVariables: readonly string[];
}

export interface PlannedRequest {
  readonly request: HttpRequestDef;
  /** The name asked for, when it was taken and the request got another. */
  readonly renamedFrom: string | null;
}

export type PlanResult = { readonly plan: CreatePlan } | { readonly error: string };

const name = z.string().trim().min(1).max(200);
const newRequestSchema = z.object({
  name,
  method: z.enum(HTTP_METHODS).default("GET"),
  url: z.string().trim().min(1).max(8192),
  headers: z.array(pairSchema).max(50).default([]),
  body: bodySchema.optional(),
});
const createRequestsArgs = z.object({
  collection: name,
  folder: z.string().max(500).optional(),
  requests: z.array(newRequestSchema).min(1).max(50),
});
const createFolderArgs = z.object({ collection: name, folder: z.string().min(1).max(500) });
const createCollectionArgs = z.object({
  name,
  variables: z.array(pairSchema).max(100).default([]),
});

const MAX_DEPTH = 10;
const VARIABLE = /\{\{\s*([^{}\s]+)\s*\}\}/g;

function describeIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue ? `${issue.path.join(".") || "arguments"}: ${issue.message}` : "Invalid arguments.";
}

function splitFolder(folder: string | undefined): string[] | null {
  const parts = (folder ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > MAX_DEPTH ? null : parts;
}

type Resolved =
  { readonly collection: Collection | null; readonly name: string } | { readonly error: string };

/** A collection by id, or by name ignoring case; null collection when none matches. */
function resolveCollection(workspace: ToolWorkspace, ref: string): Resolved {
  const byId = workspace.collections.find((c) => c.id === ref);
  if (byId) return { collection: byId, name: byId.name };
  const byName = workspace.collections.filter((c) => c.name.toLowerCase() === ref.toLowerCase());
  if (byName.length > 1) {
    return {
      error: `Several collections are named "${ref}". Give the collection's id instead (see list_collections).`,
    };
  }
  return byName[0]
    ? { collection: byName[0], name: byName[0].name }
    : { collection: null, name: ref };
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Walks `path` through the collection: the names as they exist, and the items at the end. */
function walk(items: readonly CollectionItem[], path: readonly string[]) {
  let level: readonly CollectionItem[] = items;
  const existing: string[] = [];
  for (const part of path) {
    const folder = level.find((item) => item.kind === "folder" && sameName(item.name, part));
    if (!folder || folder.kind !== "folder") break;
    existing.push(folder.name);
    level = folder.items;
  }
  const missing = path.slice(existing.length);
  return {
    folderPath: [...existing, ...missing],
    newFolders: missing,
    items: missing.length ? [] : level,
  };
}

/** "Name", or "Name (2)", "Name (3)" … if taken. */
function uniqueName(wanted: string, taken: Set<string>): string {
  let candidate = wanted;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${wanted} (${n})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function toBody(body: RequestBodyPatch | undefined, guard: SecretGuard): RequestBody {
  if (!body || body.mode === "none") return { mode: "none" };
  if (body.mode === "raw") return { ...body, raw: guard.text(body.raw) };
  return {
    mode: body.mode,
    fields: body.fields.map((f) => newKeyValue(f.key, guard.field(f.key, f.value))),
  };
}

function variablesUsed(request: HttpRequestDef): string[] {
  const body = request.body;
  const texts = [
    request.url,
    ...request.headers.map((h) => h.value),
    body.mode === "raw" ? body.raw : "",
    ...(body.mode === "urlencoded" || body.mode === "formdata"
      ? body.fields.map((f) => f.value)
      : []),
  ];
  return texts.flatMap((text) => [...text.matchAll(VARIABLE)].map((m) => m[1] ?? ""));
}

function definedVariables(
  workspace: ToolWorkspace,
  collection: Collection | null,
  extra: readonly KeyValue[],
) {
  const rows = [
    ...workspace.globals,
    ...(collection?.variables ?? []),
    ...workspace.environments.flatMap((e) => e.variables),
    ...extra,
  ];
  return new Set(rows.filter((r) => r.enabled).map((r) => r.key));
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

/** Plans `create_request`: requests added to a collection (made if needed) and folder. */
export function planCreateRequests(workspace: ToolWorkspace, args: unknown): PlanResult {
  const parsed = createRequestsArgs.safeParse(args);
  if (!parsed.success) return { error: describeIssue(parsed.error) };
  const path = splitFolder(parsed.data.folder);
  if (!path) return { error: `folder: at most ${MAX_DEPTH} levels deep.` };
  const resolved = resolveCollection(workspace, parsed.data.collection);
  if ("error" in resolved) return resolved;

  const place = walk(resolved.collection?.items ?? [], path);
  const taken = new Set(
    place.items.flatMap((item) =>
      item.kind === "request" ? [item.request.name.toLowerCase()] : [],
    ),
  );
  const guard = new SecretGuard(workspaceSecrets(workspace));
  const requests = parsed.data.requests.map((wanted): PlannedRequest => {
    const finalName = uniqueName(wanted.name, taken);
    const request = newRequest({
      name: finalName,
      method: wanted.method,
      url: guard.text(wanted.url),
      headers: wanted.headers.map((h) => newKeyValue(h.key, guard.field(h.key, h.value))),
      body: toBody(wanted.body, guard),
    });
    return { request, renamedFrom: finalName === wanted.name ? null : wanted.name };
  });
  const defined = definedVariables(workspace, resolved.collection, []);
  return {
    plan: {
      kind: "requests",
      collection: { id: resolved.collection?.id ?? null, name: resolved.name },
      folderPath: place.folderPath,
      newFolders: place.newFolders,
      requests,
      variables: [],
      replacedSecrets: sorted(guard.introduced),
      missingVariables: sorted(
        requests.flatMap((r) => variablesUsed(r.request)).filter((v) => !defined.has(v)),
      ),
    },
  };
}

/** Plans `create_folder`: a folder path in a collection (made if needed). */
export function planCreateFolder(workspace: ToolWorkspace, args: unknown): PlanResult {
  const parsed = createFolderArgs.safeParse(args);
  if (!parsed.success) return { error: describeIssue(parsed.error) };
  const path = splitFolder(parsed.data.folder);
  if (!path || path.length === 0) return { error: `folder: give 1 to ${MAX_DEPTH} folder names.` };
  const resolved = resolveCollection(workspace, parsed.data.collection);
  if ("error" in resolved) return resolved;
  const place = walk(resolved.collection?.items ?? [], path);
  if (place.newFolders.length === 0) {
    return {
      error: `The folder "${place.folderPath.join("/")}" already exists in "${resolved.name}".`,
    };
  }
  return {
    plan: {
      kind: "folder",
      collection: { id: resolved.collection?.id ?? null, name: resolved.name },
      folderPath: place.folderPath,
      newFolders: place.newFolders,
      requests: [],
      variables: [],
      replacedSecrets: [],
      missingVariables: [],
    },
  };
}

/** Plans `create_collection`: a new, empty collection, whose variables never hold secrets. */
export function planCreateCollection(workspace: ToolWorkspace, args: unknown): PlanResult {
  const parsed = createCollectionArgs.safeParse(args);
  if (!parsed.success) return { error: describeIssue(parsed.error) };
  const taken = new Set(workspace.collections.map((c) => c.name.toLowerCase()));
  const known = new Set(workspaceSecrets(workspace).map((s) => s.value));
  const emptied: string[] = [];
  const variables = parsed.data.variables.map(({ key, value }) => {
    const secret = (isSensitiveName(key) && maskValue(value) !== value) || known.has(value);
    if (secret) emptied.push(key);
    return newKeyValue(key, secret ? "" : value);
  });
  return {
    plan: {
      kind: "collection",
      collection: { id: null, name: uniqueName(parsed.data.name, taken) },
      folderPath: [],
      newFolders: [],
      requests: [],
      variables,
      replacedSecrets: sorted(emptied),
      missingVariables: [],
    },
  };
}

/** `items` with the planned requests added under `path`, making missing folders; a new array. */
function addAt(
  items: readonly CollectionItem[],
  path: readonly string[],
  requests: readonly HttpRequestDef[],
): CollectionItem[] {
  const [head, ...rest] = path;
  if (head === undefined)
    return [...items, ...requests.map((request) => ({ kind: "request" as const, request }))];
  const index = items.findIndex((item) => item.kind === "folder" && sameName(item.name, head));
  const existing = items[index];
  if (!existing || existing.kind !== "folder") {
    const folder: CollectionItem = {
      kind: "folder",
      id: newId(),
      name: head,
      auth: { type: "inherit" },
      items: addAt([], rest, requests),
    };
    return [...items, folder];
  }
  return items.map((item, i) =>
    i === index && item.kind === "folder"
      ? { ...item, items: addAt(item.items, rest, requests) }
      : item,
  );
}

export interface AppliedPlan {
  readonly collection: Collection;
  readonly isNew: boolean;
}

/** The collection after the plan, as a new object; a missing collection is created. */
export function applyCreatePlan(collections: readonly Collection[], plan: CreatePlan): AppliedPlan {
  const existing = collections.find((c) => c.id === plan.collection.id);
  const base: Collection = existing ?? {
    ...newCollection(plan.collection.name),
    variables: plan.variables,
  };
  const requests = plan.requests.map((r) => r.request);
  const collection =
    plan.kind === "collection"
      ? base
      : { ...base, items: addAt(base.items, plan.folderPath, requests) };
  return { collection, isNew: !existing };
}

/** What the agent is told after the user approved: enough to try the new requests next. */
export function createResult(plan: CreatePlan, applied: AppliedPlan) {
  return {
    collection: {
      id: applied.collection.id,
      name: applied.collection.name,
      created: applied.isNew,
    },
    folder: plan.folderPath.length ? plan.folderPath.join("/") : null,
    foldersCreated: plan.newFolders,
    requests: plan.requests.map(({ request, renamedFrom }) => ({
      id: request.id,
      name: request.name,
      ...(renamedFrom ? { renamedFrom } : {}),
    })),
    replacedSecrets: plan.replacedSecrets,
    missingVariables: plan.missingVariables,
  };
}
