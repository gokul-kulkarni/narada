import { describe, expect, it } from "vitest";
import { applyStreamEvent, EMPTY_STREAM, toResponse, type StreamEvent } from "./stream-state";

const events: StreamEvent[] = [
  { kind: "head", status: 200, statusText: "OK", headers: [["content-type", "text/plain"]] },
  { kind: "chunk", text: "ab", bytes: 2, atMs: 5 },
  { kind: "chunk", text: "cé", bytes: 3, atMs: 9 },
];

describe("stream state", () => {
  it("has no response before the status line", () => {
    expect(toResponse(EMPTY_STREAM)).toBeNull();
  });

  it("builds a partial response as pieces arrive", () => {
    const state = events.reduce(applyStreamEvent, EMPTY_STREAM);
    expect(toResponse(state)).toMatchObject({
      status: 200,
      body: "abcé",
      sizeBytes: 5,
      timeMs: 9,
      timeline: [
        { atMs: 5, end: 2 },
        { atMs: 9, end: 4 },
      ],
      incomplete: null,
    });
  });

  it("takes final size, time and completeness from the end event", () => {
    const end: StreamEvent = {
      kind: "end",
      sizeBytes: 5,
      timeMs: 20,
      isBinary: true,
      incomplete: "Stopped",
    };
    const state = [...events, end].reduce(applyStreamEvent, EMPTY_STREAM);
    expect(toResponse(state)).toMatchObject({ timeMs: 20, isBinary: true, incomplete: "Stopped" });
  });
});
