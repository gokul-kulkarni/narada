import { newId } from "../ids";
import {
  HTTP_METHODS,
  type Collection,
  type CollectionItem,
  type HttpMethod,
  type KeyValue,
  type RawLanguage,
  type RequestBody,
  type RequestDef,
} from "../model";
import { authFromPostman, authToPostman } from "./auth-convert";
import {
  bodySchema,
  descriptionText,
  eventListSchema,
  infoSchema,
  requestSchema,
  urlSchema,
  type PostmanKeyValue,
} from "./schema";
import { z } from "zod";

export const POSTMAN_SCHEMA_V21 =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const RAW_LANGUAGES: readonly RawLanguage[] = ["json", "text", "xml", "html", "javascript"];

/** Row ids are UI keys only; deriving them from position keeps round-trips stable. */
const toKeyValues = (rows: readonly PostmanKeyValue[], ownerId: string, tag: string): KeyValue[] =>
  rows.map((row, index) => ({
    id: `${ownerId}-${tag}${index}`,
    key: row.key,
    value: row.value,
    enabled: row.disabled !== true && row.enabled !== false,
  }));

const fromKeyValues = (rows: readonly KeyValue[]) =>
  rows.map((row) => ({
    key: row.key,
    value: row.value,
    ...(row.enabled ? {} : { disabled: true }),
  }));

function scripts(raw: unknown): { preRequestScript: string; testScript: string } {
  const events = eventListSchema.parse(raw ?? []);
  const script = (listen: string) => {
    const exec = events.find((e) => e.listen === listen)?.script?.exec ?? "";
    return Array.isArray(exec) ? exec.join("\n") : exec;
  };
  return { preRequestScript: script("prerequest"), testScript: script("test") };
}

function toEvents(preRequestScript: string, testScript: string) {
  const event = [
    ...(preRequestScript
      ? [
          {
            listen: "prerequest",
            script: { type: "text/javascript", exec: preRequestScript.split("\n") },
          },
        ]
      : []),
    ...(testScript
      ? [{ listen: "test", script: { type: "text/javascript", exec: testScript.split("\n") } }]
      : []),
  ];
  return event.length > 0 ? { event } : {};
}

function urlToString(url: z.infer<typeof urlSchema> | undefined): string {
  if (url === undefined || typeof url === "string") return url ?? "";
  if (url.raw !== undefined) return url.raw;
  const join = (part: string | string[] | undefined, sep: string) =>
    Array.isArray(part) ? part.join(sep) : (part ?? "");
  const query = (url.query ?? []).map((q) => (q.value ? `${q.key}=${q.value}` : q.key)).join("&");
  const host = join(url.host, ".") + (url.port ? `:${url.port}` : "");
  const path = join(url.path, "/");
  return `${url.protocol ? `${url.protocol}://` : ""}${host}${path ? `/${path}` : ""}${query ? `?${query}` : ""}`;
}

function bodyFromPostman(body: z.infer<typeof bodySchema>, ownerId: string): RequestBody {
  switch (body?.mode) {
    case "raw": {
      const language = body.options?.raw?.language as RawLanguage | undefined;
      return {
        mode: "raw",
        raw: body.raw ?? "",
        language: language && RAW_LANGUAGES.includes(language) ? language : "text",
      };
    }
    case "urlencoded":
      return { mode: "urlencoded", fields: toKeyValues(body.urlencoded ?? [], ownerId, "u") };
    case "formdata":
      return { mode: "formdata", fields: toKeyValues(body.formdata ?? [], ownerId, "f") };
    default:
      return { mode: "none" };
  }
}

function bodyToPostman(body: RequestBody): object | undefined {
  switch (body.mode) {
    case "none":
      return undefined;
    case "raw":
      return { mode: "raw", raw: body.raw, options: { raw: { language: body.language } } };
    case "urlencoded":
      return { mode: "urlencoded", urlencoded: fromKeyValues(body.fields) };
    case "formdata":
      return {
        mode: "formdata",
        formdata: fromKeyValues(body.fields).map((f) => ({ ...f, type: "text" })),
      };
  }
}

const toMethod = (method: string | undefined): HttpMethod => {
  const upper = (method ?? "GET").toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : "GET";
};

function requestFromPostman(item: Record<string, unknown>): RequestDef {
  const id = typeof item.id === "string" ? item.id : newId();
  const parsed = requestSchema.safeParse(item.request);
  const request = parsed.success ? parsed.data : "";
  const base = { id, name: String(item.name ?? "Request"), ...scripts(item.event) };
  if (typeof request === "string") {
    return {
      ...base,
      method: "GET",
      url: request,
      headers: [],
      body: { mode: "none" },
      auth: { type: "inherit" },
    };
  }
  return {
    ...base,
    method: toMethod(request.method),
    url: urlToString(request.url),
    headers: Array.isArray(request.header) ? toKeyValues(request.header, id, "h") : [],
    body: bodyFromPostman(request.body, id),
    auth: authFromPostman(request.auth, { type: "inherit" }),
  };
}

function itemsFromPostman(raw: unknown): CollectionItem[] {
  const items = Array.isArray(raw)
    ? raw.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    : [];
  return items.map((item): CollectionItem =>
    Array.isArray(item.item)
      ? {
          kind: "folder",
          id: typeof item.id === "string" ? item.id : newId(),
          name: String(item.name ?? "Folder"),
          auth: authFromPostman(item.auth, { type: "inherit" }),
          items: itemsFromPostman(item.item),
        }
      : { kind: "request", request: requestFromPostman(item) },
  );
}

function itemsToPostman(items: readonly CollectionItem[]): object[] {
  return items.map((item) => {
    if (item.kind === "folder") {
      const auth = authToPostman(item.auth);
      return {
        id: item.id,
        name: item.name,
        ...(auth ? { auth } : {}),
        item: itemsToPostman(item.items),
      };
    }
    const { request } = item;
    const auth = authToPostman(request.auth);
    const body = bodyToPostman(request.body);
    return {
      id: request.id,
      name: request.name,
      ...toEvents(request.preRequestScript, request.testScript),
      request: {
        method: request.method,
        header: fromKeyValues(request.headers),
        ...(body ? { body } : {}),
        ...(auth ? { auth } : {}),
        url: request.url,
      },
    };
  });
}

export function fromPostmanCollection(json: unknown): Collection {
  const doc = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const info = infoSchema.safeParse(doc.info);
  if (!info.success || !Array.isArray(doc.item)) {
    throw new Error("This file is not a Postman collection (expected info.name and item[]).");
  }
  const id = info.data._postman_id ?? newId();
  const variables = z
    .array(z.unknown())
    .catch([])
    .parse(doc.variable ?? []);
  return {
    id,
    name: info.data.name,
    description: descriptionText(info.data.description),
    auth: authFromPostman(doc.auth, { type: "none" }),
    variables: toKeyValues(
      variables.flatMap((v) => {
        const row = infoKeyValue(v);
        return row ? [row] : [];
      }),
      id,
      "v",
    ),
    items: itemsFromPostman(doc.item),
    ...scripts(doc.event),
  };
}

function infoKeyValue(raw: unknown): PostmanKeyValue | null {
  if (typeof raw !== "object" || raw === null || !("key" in raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    key: String(row.key),
    value:
      typeof row.value === "string"
        ? row.value
        : row.value == null
          ? ""
          : JSON.stringify(row.value),
    disabled: row.disabled === true,
  };
}

export function toPostmanCollection(collection: Collection): object {
  const auth = authToPostman(collection.auth, true);
  return {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      description: collection.description,
      schema: POSTMAN_SCHEMA_V21,
    },
    ...(auth ? { auth } : {}),
    ...toEvents(collection.preRequestScript, collection.testScript),
    variable: fromKeyValues(collection.variables),
    item: itemsToPostman(collection.items),
  };
}
