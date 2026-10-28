import { describe, expect, it } from "vitest";
import { assembleText, streamStats, textDelta } from "./stream-text";
import type { StreamMessage } from "./sse";

const message = (data: string, end: number): StreamMessage => ({
  event: "message",
  data,
  id: null,
  end,
});

describe("textDelta", () => {
  it("reads the text piece of common LLM streaming formats", () => {
    expect(textDelta('{"choices":[{"delta":{"content":"Hi"}}]}')).toBe("Hi");
    expect(textDelta('{"choices":[{"text":"Hi"}]}')).toBe("Hi");
    expect(textDelta('{"type":"content_block_delta","delta":{"text":"Hi"}}')).toBe("Hi");
    expect(textDelta('{"type":"response.output_text.delta","delta":"Hi"}')).toBe("Hi");
    expect(textDelta('{"message":{"content":"Hi"}}')).toBe("Hi");
    expect(textDelta('{"response":"Hi"}')).toBe("Hi");
    expect(textDelta('{"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}')).toBe("Hi");
  });

  it("returns null for anything else", () => {
    expect(textDelta("[DONE]")).toBeNull();
    expect(textDelta('{"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull();
    expect(textDelta("42")).toBeNull();
  });
});

describe("assembleText", () => {
  const timeline = [
    { atMs: 100, end: 10 },
    { atMs: 300, end: 20 },
  ];

  it("joins text pieces and records when they arrived", () => {
    const messages = [
      message('{"choices":[{"delta":{"role":"assistant"}}]}', 5),
      message('{"choices":[{"delta":{"content":"Keep "}}]}', 10),
      message('{"choices":[{"delta":{"content":"going."}}]}', 20),
      message("[DONE]", 20),
    ];
    expect(assembleText(messages, timeline)).toEqual({
      text: "Keep going.",
      pieces: 2,
      firstMs: 100,
      lastMs: 300,
    });
  });

  it("returns null when no message carries text", () => {
    expect(assembleText([message('{"id":1}', 5)], timeline)).toBeNull();
  });
});

describe("streamStats", () => {
  it("describes time to first text and pace", () => {
    expect(streamStats({ text: "x", pieces: 5, firstMs: 100, lastMs: 1100 })).toBe(
      "First text after 100 ms · 5 pieces · 5.0 pieces/s",
    );
    expect(streamStats({ text: "x", pieces: 1, firstMs: null, lastMs: null })).toBe("1 piece");
  });
});
