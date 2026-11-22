import type { HttpResponse, StreamMark } from "../model";

/** Bodies larger than this are cut off; the app keeps the whole body in memory. */
export const MAX_BODY_BYTES = 20 * 1024 * 1024;
export const STOPPED_MESSAGE = "Stopped before the response finished.";
export const LIMIT_MESSAGE = "Stopped at 20 MB; the rest of the response was not read.";
export const idleMessage = (timeoutMs: number) =>
  `Nothing arrived for ${timeoutMs / 1000} s, so the rest of the response was not read.`;

/** What the Rust side (or the browser fallback) reports while a response streams in. */
export type StreamEvent =
  | {
      readonly kind: "head";
      readonly status: number;
      readonly statusText: string;
      readonly headers: readonly (readonly [string, string])[];
    }
  | { readonly kind: "chunk"; readonly text: string; readonly bytes: number; readonly atMs: number }
  | {
      readonly kind: "end";
      readonly sizeBytes: number;
      readonly timeMs: number;
      readonly isBinary: boolean;
      readonly incomplete: string | null;
    };

type Head = Extract<StreamEvent, { kind: "head" }>;
type End = Extract<StreamEvent, { kind: "end" }>;

export interface StreamState {
  readonly head: Head | null;
  readonly body: string;
  readonly sizeBytes: number;
  readonly timeline: readonly StreamMark[];
  readonly end: End | null;
}

export const EMPTY_STREAM: StreamState = {
  head: null,
  body: "",
  sizeBytes: 0,
  timeline: [],
  end: null,
};

export function applyStreamEvent(state: StreamState, event: StreamEvent): StreamState {
  switch (event.kind) {
    case "head":
      return { ...state, head: event };
    case "chunk": {
      const body = state.body + event.text;
      return {
        ...state,
        body,
        sizeBytes: state.sizeBytes + event.bytes,
        timeline: [...state.timeline, { atMs: event.atMs, end: body.length }],
      };
    }
    case "end":
      return { ...state, end: event };
  }
}

/** The response so far (or in full once ended); null until the status line arrived. */
export function toResponse(state: StreamState): HttpResponse | null {
  if (!state.head) return null;
  return {
    status: state.head.status,
    statusText: state.head.statusText,
    headers: state.head.headers,
    body: state.body,
    isBinary: state.end?.isBinary ?? false,
    sizeBytes: state.end?.sizeBytes ?? state.sizeBytes,
    timeMs: state.end?.timeMs ?? state.timeline.at(-1)?.atMs ?? 0,
    timeline: state.timeline,
    incomplete: state.end?.incomplete ?? null,
  };
}
