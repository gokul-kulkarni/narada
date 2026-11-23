import { findRequest } from "@narada/core/collection-tree";
import { newKeyValue } from "@narada/core/factories";
import {
  errorMessage,
  findHeader,
  formatBytes,
  formatDuration,
  prettyBody,
} from "@narada/core/format";
import { sendWithFetch } from "@narada/core/http/fetch-transport";
import {
  HTTP_METHODS,
  type Collection,
  type Environment,
  type HttpMethod,
  type HttpRequestDef,
  type HttpResponse,
  type KeyValue,
} from "@narada/core/model";
import { prepareRequest } from "@narada/core/prepare-request";
import { describeTlsFailure, tlsFetch, type TlsSettings } from "./tls";
import { buildContext } from "@narada/core/request-context";
import type { RequestDraft, ResponseSummary, SendInput, SendResult } from "../protocol";
import { parseHeaderLines } from "../shared/headers-text";

/** Orca draws at most 16 KiB per text, so the panel previews this much of a body. */
export const PREVIEW_CHARS = 15_000;
/** A panel answer may be 1 MiB of JSON; this leaves room for escaping and headers. */
export const BODY_CHARS = 400_000;

export interface LoadedWorkspace {
  readonly collections: readonly Collection[];
  readonly environments: readonly Environment[];
  readonly globals: readonly KeyValue[];
}

const isMethod = (method: string): method is HttpMethod =>
  (HTTP_METHODS as readonly string[]).includes(method);

/** The saved request with the panel's edits; form bodies are sent as saved. */
export function applyDraft(request: HttpRequestDef, draft: RequestDraft): HttpRequestDef {
  const method = draft.method.toUpperCase();
  if (!isMethod(method)) throw new Error(`Unsupported method: ${draft.method}`);
  return {
    ...request,
    method,
    url: draft.url,
    headers: parseHeaderLines(draft.headersText).map(({ key, value }) => newKeyValue(key, value)),
    body: request.body.mode === "raw" ? { ...request.body, raw: draft.bodyText } : request.body,
  };
}

const cut = (text: string, limit: number) =>
  text.length > limit ? { text: text.slice(0, limit), cut: true } : { text, cut: false };

export function summarizeResponse(response: HttpResponse, sentUrl: string): ResponseSummary {
  const contentType = findHeader(response.headers, "content-type") ?? "";
  const preview = cut(
    response.isBinary ? "(binary body)" : prettyBody(response.body, contentType),
    PREVIEW_CHARS,
  );
  const body = cut(response.body, BODY_CHARS);
  return {
    status: response.status,
    statusText: response.statusText,
    timeMs: response.timeMs,
    sizeBytes: response.sizeBytes,
    timingLabel: `${formatDuration(response.timeMs)} · ${formatBytes(response.sizeBytes)}`,
    headers: response.headers,
    contentType,
    preview: preview.text,
    previewTruncated: preview.cut,
    body: body.text,
    bodyTruncated: body.cut,
    incomplete: response.incomplete ?? null,
    sentUrl,
  };
}

/** Resolves variables and auth with @narada/core, sends with fetch and summarizes the reply. */
export async function sendSaved(
  workspace: LoadedWorkspace,
  input: SendInput,
  options: { readonly signal?: AbortSignal; readonly timeoutMs: number; readonly tls: TlsSettings },
): Promise<SendResult> {
  const collection = workspace.collections.find((c) => c.id === input.collectionId);
  const found = collection && findRequest(collection, input.requestId);
  if (!collection || !found) {
    return { ok: false, error: "That request is no longer in the collection. Refresh the list." };
  }
  if (found.request.protocol !== "http") {
    return { ok: false, error: "MCP requests can only be sent from the Narada app." };
  }
  try {
    const request = applyDraft(found.request, input.draft);
    const environment = workspace.environments.find((e) => e.id === input.environmentId);
    const context = buildContext({
      requestId: request.id,
      collection,
      environment,
      globals: workspace.globals,
    });
    const prepared = prepareRequest(request, { ...context, timeoutMs: options.timeoutMs });
    if (prepared.url === "") return { ok: false, error: "Enter a URL to send the request." };
    const custom = await tlsFetch(options.tls);
    try {
      const response = await sendWithFetch(prepared, {
        signal: options.signal,
        fetch: custom?.fetch,
      });
      return { ok: true, response: summarizeResponse(response, prepared.url) };
    } finally {
      await custom?.close();
    }
  } catch (error) {
    return { ok: false, error: describeSendError(error) };
  }
}

/** Node's fetch fails with "fetch failed" and keeps the reason (ECONNREFUSED, …) in `cause`. */
export function describeSendError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  const message = cause ? `${errorMessage(error)}: ${errorMessage(cause)}` : errorMessage(error);
  const tlsHint = describeTlsFailure(error);
  return tlsHint ? `${message}. ${tlsHint}` : message;
}
