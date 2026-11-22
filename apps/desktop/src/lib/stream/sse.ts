import type { StreamMark } from "../model";

export type StreamKind = "sse" | "ndjson";

/** One complete message of a streamed body. `end` is the body offset just past it. */
export interface StreamMessage {
  readonly event: string;
  readonly data: string;
  readonly id: string | null;
  readonly end: number;
}

const NDJSON_TYPES = new Set([
  "application/x-ndjson",
  "application/ndjson",
  "application/jsonl",
  "application/x-jsonlines",
  "application/stream+json",
]);

export function streamKind(contentType: string): StreamKind | null {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "text/event-stream") return "sse";
  return NDJSON_TYPES.has(type) ? "ndjson" : null;
}

interface Line {
  readonly text: string;
  readonly end: number;
}

/** Lines that have their line break; a trailing CR may be half of a CRLF, so it waits. */
function completeLines(body: string): readonly Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of body.matchAll(/\r\n|\r|\n/g)) {
    const end = match.index + match[0].length;
    if (match[0] === "\r" && end === body.length) break;
    lines.push({ text: body.slice(start, match.index), end });
    start = end;
  }
  return lines;
}

/** Server-sent events, per the WHATWG event-stream format. */
function parseEventStream(body: string): readonly StreamMessage[] {
  const messages: StreamMessage[] = [];
  let data: readonly string[] = [];
  let event = "";
  let id: string | null = null;
  for (const line of completeLines(body)) {
    if (line.text === "") {
      if (data.length > 0) {
        messages.push({ event: event || "message", data: data.join("\n"), id, end: line.end });
      }
      data = [];
      event = "";
      continue;
    }
    if (line.text.startsWith(":")) continue;
    const colon = line.text.indexOf(":");
    const field = colon === -1 ? line.text : line.text.slice(0, colon);
    const value = colon === -1 ? "" : line.text.slice(colon + 1).replace(/^ /, "");
    if (field === "data") data = [...data, value];
    else if (field === "event") event = value;
    else if (field === "id" && !value.includes("\0")) id = value;
  }
  return messages;
}

function parseJsonLines(body: string, complete: boolean): readonly StreamMessage[] {
  const lines = completeLines(body);
  const lastEnd = lines.at(-1)?.end ?? 0;
  const tail =
    complete && lastEnd < body.length ? [{ text: body.slice(lastEnd), end: body.length }] : [];
  return [...lines, ...tail]
    .filter((line) => line.text.trim() !== "")
    .map((line) => ({ event: "message", data: line.text.trim(), id: null, end: line.end }));
}

/** Complete messages in `body`; `complete` means no more data will arrive. */
export function parseStream(
  kind: StreamKind,
  body: string,
  complete = false,
): readonly StreamMessage[] {
  return kind === "sse" ? parseEventStream(body) : parseJsonLines(body, complete);
}

/** When the piece containing body offset `end` arrived, if known. */
export function arrivalMs(timeline: readonly StreamMark[], end: number): number | null {
  return timeline.find((mark) => mark.end >= end)?.atMs ?? null;
}
