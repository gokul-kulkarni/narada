import { z } from "zod";
import { newKeyValue } from "../factories";
import { HTTP_METHODS, type HttpRequestDef, type KeyValue, type RequestBody } from "../model";

/**
 * A change an agent suggests for an HTTP request, as a ```narada-patch JSON block at the end
 * of its answer. Only these fields can change; auth, scripts and anything else cannot.
 */
export interface RequestPatch {
  readonly method?: HttpRequestDef["method"];
  readonly url?: string;
  /** Set by name (case-insensitive); added when missing. */
  readonly headers?: readonly PatchPair[];
  readonly removeHeaders?: readonly string[];
  readonly body?: RequestBodyPatch;
}

export interface PatchPair {
  readonly key: string;
  readonly value: string;
}

export type RequestBodyPatch =
  | { readonly mode: "none" }
  | { readonly mode: "raw"; readonly language: RawBodyLanguage; readonly raw: string }
  | { readonly mode: "urlencoded" | "formdata"; readonly fields: readonly PatchPair[] };

export interface ExtractedPatch {
  /** null when the block was unusable; `warnings` says why. */
  readonly patch: RequestPatch | null;
  readonly warnings: readonly string[];
}

const RAW_LANGUAGES = ["json", "text", "xml", "html", "javascript"] as const;
type RawBodyLanguage = (typeof RAW_LANGUAGES)[number];

const MAX_TEXT = 1_000_000;
export const pairSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.string().max(8192),
});

/** A request body an agent may write: none, raw text, or url-encoded/form fields. */
export const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("raw"),
    language: z.enum(RAW_LANGUAGES).default("json"),
    raw: z.string().max(MAX_TEXT),
  }),
  z.object({ mode: z.enum(["urlencoded", "formdata"]), fields: z.array(pairSchema).max(200) }),
]);

// Unknown fields (auth, scripts, …) are dropped by zod's default object parsing.
const patchSchema = z.object({
  method: z.enum(HTTP_METHODS).optional(),
  url: z.string().min(1).max(8192).optional(),
  headers: z.array(pairSchema).max(50).optional(),
  removeHeaders: z.array(z.string().min(1).max(256)).max(50).optional(),
  body: bodySchema.optional(),
});

const BLOCK = /```narada-patch[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
const SECRET_PLACEHOLDER = /\[secret:([A-Za-z0-9_.-]+)\]/g;
const REDACTED = "[redacted]";
const UNREADABLE = "The suggested change couldn't be read, so it can't be applied.";

/** The agent saw `[secret:name]` in place of each secret; in the request it is `{{name}}`. */
const restore = (text: string): string => text.replace(SECRET_PLACEHOLDER, "{{$1}}");
const restorePairs = (pairs: readonly PatchPair[]): PatchPair[] =>
  pairs.map((p) => ({ key: p.key, value: restore(p.value) }));

/** Restores placeholders and drops parts that still hold a value the agent never saw. */
function clean(raw: z.infer<typeof patchSchema>): ExtractedPatch {
  const warnings: string[] = [];
  let patch: RequestPatch = {};
  if (raw.method) patch = { ...patch, method: raw.method };
  if (raw.url !== undefined) {
    if (raw.url.includes(REDACTED))
      warnings.push("The suggested URL holds a hidden value, so it was left as it is.");
    else patch = { ...patch, url: restore(raw.url) };
  }
  if (raw.headers) patch = { ...patch, headers: restorePairs(raw.headers) };
  if (raw.removeHeaders) patch = { ...patch, removeHeaders: raw.removeHeaders };
  if (raw.body) {
    const body: RequestBodyPatch =
      raw.body.mode === "raw"
        ? { ...raw.body, raw: restore(raw.body.raw) }
        : raw.body.mode === "none"
          ? raw.body
          : { mode: raw.body.mode, fields: restorePairs(raw.body.fields) };
    if (JSON.stringify(body).includes(REDACTED)) {
      warnings.push("The suggested body holds hidden values, so it was left as it is.");
    } else {
      patch = { ...patch, body };
    }
  }
  return { patch: Object.keys(patch).length > 0 ? patch : null, warnings };
}

/** The suggested change in an answer: its last narada-patch block, checked; null if none. */
export function extractPatch(text: string): ExtractedPatch | null {
  const blocks = [...text.matchAll(BLOCK)];
  const last = blocks.at(-1)?.[1];
  if (last === undefined) return null;
  try {
    const parsed = patchSchema.safeParse(JSON.parse(last));
    if (!parsed.success) return { patch: null, warnings: [UNREADABLE] };
    const result = clean(parsed.data);
    return result.patch || result.warnings.length > 0
      ? result
      : { patch: null, warnings: [UNREADABLE] };
  } catch {
    return { patch: null, warnings: [UNREADABLE] };
  }
}

/** The answer without its patch blocks, which are shown as a change to apply instead. */
export const stripPatch = (text: string): string => text.replace(BLOCK, "").trimEnd();

function applyHeaders(headers: readonly KeyValue[], patch: RequestPatch): KeyValue[] {
  const set = (rows: readonly KeyValue[], { key, value }: PatchPair): readonly KeyValue[] => {
    const index = rows.findIndex((row) => row.key.toLowerCase() === key.toLowerCase());
    // A value the agent only saw as [redacted] stays as it is, or is not added at all.
    if (value.includes(REDACTED)) return rows;
    if (index === -1) return [...rows, newKeyValue(key, value)];
    return rows.map((row, i) => (i === index ? { ...row, value, enabled: true } : row));
  };
  const removed = new Set((patch.removeHeaders ?? []).map((key) => key.toLowerCase()));
  return (patch.headers ?? [])
    .reduce(set, headers)
    .filter((row) => !removed.has(row.key.toLowerCase()));
}

function toBody(body: RequestBodyPatch): RequestBody {
  if (body.mode === "none" || body.mode === "raw") return body;
  return { mode: body.mode, fields: body.fields.map((f) => newKeyValue(f.key, f.value)) };
}

/** The request with the patch applied; returns a new request. */
export function applyPatch(request: HttpRequestDef, patch: RequestPatch): HttpRequestDef {
  return {
    ...request,
    method: patch.method ?? request.method,
    url: patch.url ?? request.url,
    headers: applyHeaders(request.headers, patch),
    body: patch.body ? toBody(patch.body) : request.body,
  };
}

export interface RequestChange {
  readonly label: string;
  /** null: added. */
  readonly before: string | null;
  /** null: removed. */
  readonly after: string | null;
}

function describeBody(body: RequestBody): string {
  if (body.mode === "none") return "none";
  if (body.mode === "raw") return `raw (${body.language})\n${body.raw}`;
  const fields = body.fields.filter((f) => f.enabled).map((f) => `${f.key}=${f.value}`);
  return [body.mode, ...fields].join("\n");
}

function headerChanges(before: readonly KeyValue[], after: readonly KeyValue[]): RequestChange[] {
  const enabled = (rows: readonly KeyValue[]) =>
    new Map(rows.filter((r) => r.enabled).map((r) => [r.key.toLowerCase(), r] as const));
  const was = enabled(before);
  const now = enabled(after);
  const changedOrRemoved = [...was].flatMap(([name, row]): RequestChange[] => {
    const next = now.get(name);
    if (next?.value === row.value) return [];
    return [{ label: `Header ${row.key}`, before: row.value, after: next?.value ?? null }];
  });
  const added = [...now]
    .filter(([name]) => !was.has(name))
    .map(([, row]): RequestChange => ({
      label: `Header ${row.key}`,
      before: null,
      after: row.value,
    }));
  return [...changedOrRemoved, ...added];
}

/** What differs between two versions of a request, for showing a suggested change. */
export function describeChanges(before: HttpRequestDef, after: HttpRequestDef): RequestChange[] {
  const changes: RequestChange[] = [];
  if (before.method !== after.method) {
    changes.push({ label: "Method", before: before.method, after: after.method });
  }
  if (before.url !== after.url)
    changes.push({ label: "URL", before: before.url, after: after.url });
  changes.push(...headerChanges(before.headers, after.headers));
  const [was, now] = [describeBody(before.body), describeBody(after.body)];
  if (was !== now) changes.push({ label: "Body", before: was, after: now });
  return changes;
}
