import { describe, expect, it } from "vitest";
import { arrivalMs, parseStream, streamKind } from "./sse";

describe("streamKind", () => {
  it("recognises event streams and JSON lines", () => {
    expect(streamKind("text/event-stream; charset=utf-8")).toBe("sse");
    expect(streamKind("application/x-ndjson")).toBe("ndjson");
    expect(streamKind("application/jsonl")).toBe("ndjson");
    expect(streamKind("application/json")).toBeNull();
    expect(streamKind("")).toBeNull();
  });
});

describe("parseStream (sse)", () => {
  it("splits events on blank lines and joins multi-line data", () => {
    const body = "data: one\n\nevent: delta\nid: 7\ndata: a\ndata: b\n\n";
    expect(parseStream("sse", body)).toEqual([
      { event: "message", data: "one", id: null, end: 11 },
      { event: "delta", data: "a\nb", id: "7", end: body.length },
    ]);
  });

  it("ignores comments, keeps the last id and strips one leading space", () => {
    const body = ": keep-alive\nid: 1\ndata:  two spaces\n\ndata:x\n\n";
    const events = parseStream("sse", body);
    expect(events.map((e) => [e.data, e.id])).toEqual([
      [" two spaces", "1"],
      ["x", "1"],
    ]);
  });

  it("waits for the blank line before an event counts", () => {
    expect(parseStream("sse", "data: half")).toEqual([]);
    expect(parseStream("sse", "data: half\n")).toEqual([]);
  });

  it("handles CRLF, and a CR at the end that may be half of a CRLF", () => {
    expect(parseStream("sse", "data: a\r\n\r\n")).toHaveLength(1);
    expect(parseStream("sse", "data: a\r\n\r")).toEqual([]);
  });

  it("skips events without data", () => {
    expect(parseStream("sse", "event: ping\n\n")).toEqual([]);
  });
});

describe("parseStream (ndjson)", () => {
  it("returns one event per complete line", () => {
    const body = '{"a":1}\n\n{"a":2}\n{"a":';
    expect(parseStream("ndjson", body).map((e) => e.data)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it("includes an unterminated last line once the stream is complete", () => {
    expect(parseStream("ndjson", '{"a":1}\n{"a":2}', true)).toHaveLength(2);
  });
});

describe("arrivalMs", () => {
  const timeline = [
    { atMs: 10, end: 5 },
    { atMs: 40, end: 12 },
  ];
  it("finds the piece that completed an offset", () => {
    expect(arrivalMs(timeline, 3)).toBe(10);
    expect(arrivalMs(timeline, 12)).toBe(40);
    expect(arrivalMs(timeline, 99)).toBeNull();
  });
});
