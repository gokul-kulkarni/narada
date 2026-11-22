import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { errorMessage } from "./format";
import { newId } from "./ids";
import type { HttpResponse } from "./model";
import type { PreparedRequest } from "./prepare-request";
import {
  applyStreamEvent,
  EMPTY_STREAM,
  idleMessage,
  LIMIT_MESSAGE,
  MAX_BODY_BYTES,
  STOPPED_MESSAGE,
  toResponse,
  type StreamEvent,
  type StreamState,
} from "./stream/stream-state";

export interface SendOptions {
  /** Called with the response so far each time more of it arrives. */
  readonly onProgress?: (partial: HttpResponse) => void;
  /** Aborting stops the request; a body already streaming ends as `incomplete`. */
  readonly signal?: AbortSignal;
}

const CANCELLED = "Request cancelled";

/** Collects stream events and reports progress; `finish` returns the full response. */
function createReceiver(options: SendOptions) {
  let state: StreamState = EMPTY_STREAM;
  return {
    receive(event: StreamEvent) {
      state = applyStreamEvent(state, event);
      const partial = event.kind === "end" ? null : toResponse(state);
      if (partial) options.onProgress?.(partial);
    },
    finish(): HttpResponse {
      const response = toResponse(state);
      if (!response) throw new Error("The response ended before its status line arrived");
      return response;
    },
  };
}

async function sendWithTauri(request: PreparedRequest, options: SendOptions) {
  const id = newId();
  const receiver = createReceiver(options);
  let ended = () => {};
  const done = new Promise<void>((resolve) => (ended = resolve));
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (event) => {
    receiver.receive(event);
    if (event.kind === "end") ended();
  };
  const stop = () => void invoke("cancel_request", { id });
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    await invoke("send_request", { request, id, channel });
    await done;
    return receiver.finish();
  } finally {
    options.signal?.removeEventListener("abort", stop);
  }
}

type Reason = "stopped" | "timeout" | null;

/** Reads the body piece by piece; returns why it stopped early, if it did. */
async function readBody(
  body: ReadableStream<Uint8Array>,
  emit: (text: string, bytes: number) => void,
  touch: () => void,
  reason: () => Reason,
  timeoutMs: number,
): Promise<string | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  try {
    for (;;) {
      touch();
      const { done, value } = await reader.read();
      if (done) break;
      const room = Math.max(0, MAX_BODY_BYTES - size);
      const kept = value.subarray(0, room);
      size += kept.length;
      emit(decoder.decode(kept, { stream: true }), kept.length);
      if (kept.length < value.length) {
        await reader.cancel();
        return LIMIT_MESSAGE;
      }
    }
    const tail = decoder.decode();
    if (tail) emit(tail, 0);
    return null;
  } catch (error) {
    if (reason() === "stopped") return STOPPED_MESSAGE;
    if (reason() === "timeout") return idleMessage(timeoutMs);
    return `Stream interrupted: ${errorMessage(error)}`;
  }
}

const fetchBody = (request: PreparedRequest) =>
  request.body.type === "text"
    ? request.body.content
    : request.body.type === "multipart"
      ? request.body.fields.reduce((form, [k, v]) => (form.append(k, v), form), new FormData())
      : undefined;

/** Browser fallback so the UI can run (and be E2E tested) outside the Tauri shell. */
async function sendWithFetch(request: PreparedRequest, options: SendOptions) {
  const controller = new AbortController();
  const receiver = createReceiver(options);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let reason: Reason = null;
  const abort = (why: Exclude<Reason, null>) => {
    reason = why;
    controller.abort();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timeout limits how long the server may stay silent, not how long a stream may run.
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => abort("timeout"), request.timeoutMs);
  };
  const stop = () => abort("stopped");
  if (options.signal?.aborted) throw new Error(CANCELLED);
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    touch();
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers.map(([k, v]): [string, string] => [k, v]),
      body: fetchBody(request),
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (reason === "timeout") throw new Error("Request timed out");
      throw reason === "stopped" ? new Error(CANCELLED) : error;
    });
    receiver.receive({
      kind: "head",
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
    let size = 0;
    const emit = (text: string, bytes: number) => {
      size += bytes;
      receiver.receive({ kind: "chunk", text, bytes, atMs: elapsed() });
    };
    const incomplete = response.body
      ? await readBody(response.body, emit, touch, () => reason, request.timeoutMs)
      : null;
    receiver.receive({
      kind: "end",
      sizeBytes: size,
      timeMs: elapsed(),
      isBinary: false,
      incomplete,
    });
    return receiver.finish();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
  }
}

export async function sendHttp(
  request: PreparedRequest,
  options: SendOptions = {},
): Promise<HttpResponse> {
  return isTauri() ? sendWithTauri(request, options) : sendWithFetch(request, options);
}
