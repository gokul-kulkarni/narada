import { z } from "zod";
import { redactAuth } from "../assist/redact";
import { isSensitiveName, scrubDeep, scrubText } from "../assist/scrub";
import type { SecretValue } from "../assist/types";
import { findRequest } from "../collection-tree";
import type {
  Collection,
  CollectionItem,
  Environment,
  HistoryEntry,
  KeyValue,
  RequestDef,
} from "../model";

/**
 * What Narada's MCP tools answer from: the user's workspace as the app holds it. Every
 * answer has secrets removed, since it goes to a coding agent.
 */
export interface ToolWorkspace {
  readonly collections: readonly Collection[];
  readonly environments: readonly Environment[];
  readonly globals: readonly KeyValue[];
  readonly activeEnvironmentId: string | null;
  /** Newest first. */
  readonly history: readonly HistoryEntry[];
}

/** A tool's answer: JSON for the agent, or an error message it can act on. */
export type ToolResult = { readonly result: unknown } | { readonly error: string };

export type CollectionNode =
  | { readonly type: "folder"; readonly name: string; readonly items: CollectionNode[] }
  | {
      readonly type: "request";
      readonly id: string;
      readonly name: string;
      readonly protocol: RequestDef["protocol"];
      readonly method: string;
      readonly url: string;
    };

const enabled = <T extends KeyValue>(rows: readonly T[]): T[] =>
  rows.filter((row) => row.enabled && row.key.trim() !== "" && row.value !== "");

/**
 * Every value to hide: secret variables of every environment (not just the active one), and
 * any variable whose name says it holds a credential.
 */
export function workspaceSecrets(workspace: ToolWorkspace): SecretValue[] {
  const marked = workspace.environments.flatMap((e) =>
    enabled(e.variables).filter((v) => v.secret),
  );
  const named = [
    ...workspace.globals,
    ...workspace.collections.flatMap((c) => c.variables),
    ...workspace.environments.flatMap((e) => e.variables),
  ];
  return [...marked, ...enabled(named).filter((row) => isSensitiveName(row.key))].map((row) => ({
    name: row.key,
    value: row.value,
  }));
}

/** "POST" for HTTP; the operation for MCP ("tool", "resource", "prompt"). */
const methodOf = (request: RequestDef): string =>
  request.protocol === "http" ? request.method : `MCP ${request.operation.type}`;

const targetOf = (request: RequestDef): string =>
  request.protocol === "http"
    ? request.url
    : request.operation.type === "resource"
      ? request.operation.uri
      : request.operation.name;

function toNodes(
  items: readonly CollectionItem[],
  secrets: readonly SecretValue[],
): CollectionNode[] {
  return items.map((item) =>
    item.kind === "folder"
      ? { type: "folder", name: item.name, items: toNodes(item.items, secrets) }
      : {
          type: "request",
          id: item.request.id,
          name: item.request.name,
          protocol: item.request.protocol,
          method: methodOf(item.request),
          url: scrubText(targetOf(item.request), secrets),
        },
  );
}

export function listCollections(workspace: ToolWorkspace) {
  const secrets = workspaceSecrets(workspace);
  return workspace.collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    items: toNodes(collection.items, secrets),
  }));
}

/** Folder names by id, for showing where a request lives. */
function folderNames(items: readonly CollectionItem[]): Map<string, string> {
  return new Map(
    items.flatMap((item): [string, string][] =>
      item.kind === "folder" ? [[item.id, item.name], ...folderNames(item.items)] : [],
    ),
  );
}

const getRequestArgs = z.object({ requestId: z.string().min(1) });

/** One saved request, with credentials masked by position and every secret value removed. */
export function getRequest(workspace: ToolWorkspace, args: unknown): ToolResult {
  const parsed = getRequestArgs.safeParse(args);
  if (!parsed.success) return { error: "Give requestId as a string." };
  const { requestId } = parsed.data;
  for (const collection of workspace.collections) {
    const found = findRequest(collection, requestId);
    if (!found) continue;
    const { request } = found;
    const masked: RequestDef =
      request.protocol === "http"
        ? {
            ...request,
            headers: request.headers.map((h) =>
              isSensitiveName(h.key) ? { ...h, value: "[redacted]" } : h,
            ),
            auth: redactAuth(request.auth),
          }
        : request;
    const names = folderNames(collection.items);
    const folder = found.folderPath.map((id) => names.get(id) ?? id);
    const result = { collection: collection.name, folder, request: masked };
    return { result: scrubDeep(result, workspaceSecrets(workspace)) };
  }
  return { error: `No saved request with id "${requestId}". Use list_collections to find one.` };
}

/** Environments with variable names and which are secret; values are never included. */
export function listEnvironments(workspace: ToolWorkspace) {
  return workspace.environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
    active: environment.id === workspace.activeEnvironmentId,
    variables: environment.variables
      .filter((v) => v.enabled && v.key.trim() !== "")
      .map((v) => ({ name: v.key, secret: v.secret })),
  }));
}

const DEFAULT_HISTORY = 20;
const historyArgs = z.object({ limit: z.number().int().min(1).max(200).optional() });

export function listHistory(workspace: ToolWorkspace, args: unknown): ToolResult {
  const parsed = historyArgs.safeParse(args ?? {});
  if (!parsed.success) return { error: "limit must be a whole number from 1 to 200." };
  const secrets = workspaceSecrets(workspace);
  const result = workspace.history.slice(0, parsed.data.limit ?? DEFAULT_HISTORY).map((entry) => ({
    sentAt: entry.sentAt,
    method: methodOf(entry.request),
    url: scrubText(targetOf(entry.request), secrets),
    status: entry.status ?? "not delivered",
    timeMs: entry.timeMs,
    environment: entry.environment ?? null,
  }));
  return { result };
}
