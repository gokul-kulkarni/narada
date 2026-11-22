import { findRequest } from "@narada/core/collection-tree";
import type {
  Auth,
  Collection,
  CollectionItem,
  Environment,
  HttpRequestDef,
} from "@narada/core/model";
import type {
  EnvironmentSummary,
  RequestSummary,
  RequestTreeItem,
  WorkspaceSnapshot,
} from "../protocol";
import { formatHeaderLines } from "../shared/headers-text";

/** Tree keys are unique across collections, since request ids only are unique within one. */
export const requestKey = (collectionId: string, requestId: string) =>
  `r:${collectionId}:${requestId}`;
const folderKey = (collectionId: string, folderId: string) => `f:${collectionId}:${folderId}`;
const collectionKey = (collectionId: string) => `c:${collectionId}`;

const AUTH_NAMES: Record<Auth["type"], string> = {
  inherit: "Inherited",
  none: "No auth",
  basic: "Basic auth",
  bearer: "Bearer token",
  apikey: "API key",
  oauth2: "OAuth 2.0 token",
};

/** Names the auth that applies and where it comes from, as Postman's inheritance resolves it. */
export function describeAuth(chain: readonly Auth[]): string {
  const index = chain.findIndex((auth) => auth.type !== "inherit");
  if (index === -1) return AUTH_NAMES.none;
  const name = AUTH_NAMES[chain[index].type];
  if (index === 0 || chain[index].type === "none") return name;
  return index === chain.length - 1 ? `${name}, from the collection` : `${name}, from a folder`;
}

function summarize(collection: Collection, request: HttpRequestDef, location: string) {
  const found = findRequest(collection, request.id);
  const body = request.body;
  return {
    key: requestKey(collection.id, request.id),
    collectionId: collection.id,
    requestId: request.id,
    name: request.name,
    location,
    method: request.method,
    url: request.url,
    headersText: formatHeaderLines(request.headers.filter((h) => h.enabled && h.key)),
    bodyMode: body.mode,
    bodyText: body.mode === "raw" ? body.raw : "",
    formFields:
      body.mode === "urlencoded" || body.mode === "formdata"
        ? body.fields.filter((f) => f.enabled && f.key).map(({ key, value }) => ({ key, value }))
        : [],
    authLabel: describeAuth([request.auth, ...(found?.authChain ?? [collection.auth])]),
    hasScripts: [
      request.preRequestScript,
      request.testScript,
      collection.preRequestScript,
      collection.testScript,
    ].some((script) => script.trim() !== ""),
  } satisfies RequestSummary;
}

interface Built {
  readonly tree: RequestTreeItem[];
  readonly requests: Record<string, RequestSummary>;
}

function buildItems(
  collection: Collection,
  items: readonly CollectionItem[],
  location: string,
): Built {
  return items.reduce<Built>(
    (acc, item) => {
      if (item.kind === "folder") {
        const inner = buildItems(collection, item.items, `${location} / ${item.name}`);
        const node: RequestTreeItem = {
          key: folderKey(collection.id, item.id),
          label: item.name,
          icon: "folder",
          children: inner.tree,
        };
        return { tree: [...acc.tree, node], requests: { ...acc.requests, ...inner.requests } };
      }
      const request = item.request;
      if (request.protocol !== "http") {
        const node: RequestTreeItem = {
          key: requestKey(collection.id, request.id),
          label: request.name,
          description: "MCP: open in Narada",
          icon: "plug",
          disabled: true,
        };
        return { ...acc, tree: [...acc.tree, node] };
      }
      const summary = summarize(collection, request, location);
      const node: RequestTreeItem = {
        key: summary.key,
        label: request.name,
        description: request.method,
        icon: "globe",
      };
      return { tree: [...acc.tree, node], requests: { ...acc.requests, [summary.key]: summary } };
    },
    { tree: [], requests: {} },
  );
}

export function summarizeEnvironment(environment: Environment): EnvironmentSummary {
  return {
    id: environment.id,
    name: environment.name,
    missingSecrets: environment.variables
      .filter((v) => v.secret && v.enabled && v.key && v.value === "")
      .map((v) => v.key),
  };
}

export function buildSnapshot(
  folder: WorkspaceSnapshot["folder"],
  collections: readonly Collection[],
  environments: readonly Environment[],
  errors: WorkspaceSnapshot["errors"],
): WorkspaceSnapshot {
  const built = collections.reduce<Built>(
    (acc, collection) => {
      const inner = buildItems(collection, collection.items, collection.name);
      const node: RequestTreeItem = {
        key: collectionKey(collection.id),
        label: collection.name,
        icon: "folder",
        children: inner.tree,
      };
      return { tree: [...acc.tree, node], requests: { ...acc.requests, ...inner.requests } };
    },
    { tree: [], requests: {} },
  );
  return {
    folder,
    tree: built.tree,
    requests: built.requests,
    environments: environments.map(summarizeEnvironment),
    errors,
  };
}
