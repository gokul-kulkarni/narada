import { formatDuration } from "../format";
import type { StreamMark } from "../model";
import { arrivalMs, type StreamMessage } from "./sse";

/** Text assembled from the pieces of a streamed LLM reply. */
export interface AssembledText {
  readonly text: string;
  readonly pieces: number;
  readonly firstMs: number | null;
  readonly lastMs: number | null;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const get = (value: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>(
    (at, key) => (isObject(at) || Array.isArray(at) ? (at as Json)[key] : undefined),
    value,
  );

/** Where the text piece lives in OpenAI, Anthropic, Ollama and Gemini streams. */
const TEXT_PATHS: readonly (readonly (string | number)[])[] = [
  ["choices", 0, "delta", "content"],
  ["choices", 0, "text"],
  ["message", "content"],
  ["response"],
  ["candidates", 0, "content", "parts", 0, "text"],
];

function typedDelta(value: Json): unknown {
  if (value.type === "content_block_delta") return get(value, "delta", "text");
  if (value.type === "response.output_text.delta") return value.delta;
  return undefined;
}

export function textDelta(data: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  const typed = typedDelta(value);
  if (typeof typed === "string") return typed;
  const found = TEXT_PATHS.map((path) => get(value, ...path)).find((v) => typeof v === "string");
  return typeof found === "string" ? found : null;
}

export function assembleText(
  messages: readonly StreamMessage[],
  timeline: readonly StreamMark[],
): AssembledText | null {
  const pieces = messages
    .map((m) => ({ text: textDelta(m.data), end: m.end }))
    .filter((p): p is { text: string; end: number } => p.text !== null && p.text !== "");
  if (pieces.length === 0) return null;
  return {
    text: pieces.map((p) => p.text).join(""),
    pieces: pieces.length,
    firstMs: arrivalMs(timeline, pieces[0].end),
    lastMs: arrivalMs(timeline, pieces[pieces.length - 1].end),
  };
}

export function streamStats({ pieces, firstMs, lastMs }: AssembledText): string {
  const count = `${pieces} ${pieces === 1 ? "piece" : "pieces"}`;
  if (firstMs === null || lastMs === null) return count;
  const seconds = (lastMs - firstMs) / 1000;
  const pace = pieces > 1 && seconds > 0 ? ` · ${(pieces / seconds).toFixed(1)} pieces/s` : "";
  return `First text after ${formatDuration(firstMs)} · ${count}${pace}`;
}
