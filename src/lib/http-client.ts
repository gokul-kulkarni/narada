import { invoke, isTauri } from "@tauri-apps/api/core";
import type { HttpResponse } from "./model";
import type { PreparedRequest } from "./prepare-request";

/** Browser fallback so the UI can run (and be E2E tested) outside the Tauri shell. */
async function sendWithFetch(request: PreparedRequest): Promise<HttpResponse> {
  const started = performance.now();
  const body =
    request.body.type === "text"
      ? request.body.content
      : request.body.type === "multipart"
        ? request.body.fields.reduce((form, [k, v]) => (form.append(k, v), form), new FormData())
        : undefined;
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers.map(([k, v]): [string, string] => [k, v]),
    body,
    signal: AbortSignal.timeout(request.timeoutMs),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: new TextDecoder().decode(bytes),
    isBinary: false,
    sizeBytes: bytes.length,
    timeMs: Math.round(performance.now() - started),
  };
}

export async function sendHttp(request: PreparedRequest): Promise<HttpResponse> {
  return isTauri() ? invoke<HttpResponse>("send_request", { request }) : sendWithFetch(request);
}
