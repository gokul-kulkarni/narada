import { applyAuth, effectiveAuth, type HeaderPair } from "./auth";
import type { Auth, KeyValue, RawLanguage, RequestBody, RequestDef } from "./model";
import { resolveTemplate, type VariableScopes } from "./variables";

export const DEFAULT_TIMEOUT_MS = 30_000;

const RAW_CONTENT_TYPES: Record<RawLanguage, string> = {
  json: "application/json",
  text: "text/plain",
  xml: "application/xml",
  html: "text/html",
  javascript: "application/javascript",
};

/** Mirrors the Rust `HttpRequest` command payload. */
export type PreparedBody =
  | { readonly type: "none" }
  | { readonly type: "text"; readonly content: string }
  | { readonly type: "multipart"; readonly fields: readonly HeaderPair[] };

export interface PreparedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly HeaderPair[];
  readonly body: PreparedBody;
  readonly timeoutMs: number;
}

export interface PrepareContext {
  readonly scopes: VariableScopes;
  /** Auth of the parent folders, innermost first, ending with the collection. */
  readonly authChain: readonly Auth[];
  readonly timeoutMs?: number;
}

type Resolve = (text: string) => string;

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function ensureScheme(url: string): string {
  return url === "" || SCHEME_PATTERN.test(url) ? url : `http://${url}`;
}

function resolvePairs(pairs: readonly KeyValue[], resolve: Resolve): HeaderPair[] {
  return pairs
    .filter((pair) => pair.enabled && pair.key.trim() !== "")
    .map((pair) => [resolve(pair.key), resolve(pair.value)] as const);
}

function prepareBody(
  body: RequestBody,
  resolve: Resolve,
): { body: PreparedBody; contentType?: string } {
  switch (body.mode) {
    case "none":
      return { body: { type: "none" } };
    case "raw":
      return {
        body: { type: "text", content: resolve(body.raw) },
        contentType: RAW_CONTENT_TYPES[body.language],
      };
    case "urlencoded":
      return {
        body: {
          type: "text",
          content: new URLSearchParams(
            resolvePairs(body.fields, resolve).map(([k, v]) => [k, v]),
          ).toString(),
        },
        contentType: "application/x-www-form-urlencoded",
      };
    case "formdata":
      return { body: { type: "multipart", fields: resolvePairs(body.fields, resolve) } };
  }
}

function resolveAuth(auth: Auth, resolve: Resolve): Auth {
  const resolved = Object.fromEntries(
    Object.entries(auth).map(([key, value]) =>
      key === "type" || key === "in" || typeof value !== "string"
        ? [key, value]
        : [key, resolve(value)],
    ),
  );
  return resolved as Auth;
}

export function prepareRequest(request: RequestDef, context: PrepareContext): PreparedRequest {
  const resolve: Resolve = (text) => resolveTemplate(text, context.scopes);
  const userHeaders = resolvePairs(request.headers, resolve);
  const { body, contentType } = prepareBody(request.body, resolve);
  const hasContentType = userHeaders.some(([key]) => key.toLowerCase() === "content-type");
  const headers: HeaderPair[] =
    contentType && !hasContentType ? [...userHeaders, ["Content-Type", contentType]] : userHeaders;

  const auth = resolveAuth(effectiveAuth([request.auth, ...context.authChain]), resolve);
  const authed = applyAuth({ url: ensureScheme(resolve(request.url).trim()), headers }, auth);

  return {
    method: request.method,
    url: authed.url,
    headers: authed.headers,
    body,
    timeoutMs: context.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}
