import { describe, expect, it } from "vitest";
import {
  parsePrompts,
  parseTools,
  prettyText,
  readPromptResult,
  readResourceResult,
  readToolResult,
} from "./results";

describe("MCP result parsing", () => {
  it("keeps the list entries that parse", () => {
    const tools = parseTools([{ name: "add", inputSchema: { type: "object" } }, { nope: 1 }]);
    expect(tools).toEqual([{ name: "add", inputSchema: { type: "object" } }]);
    expect(parsePrompts([{ name: "greet" }])[0].arguments).toEqual([]);
  });

  it("reads tool results into display blocks", () => {
    const result = readToolResult({
      content: [
        { type: "text", text: "5" },
        { type: "image", data: "AAA", mimeType: "image/png" },
        { type: "resource", resource: { uri: "file:///a", text: "hi" } },
        { type: "resource_link", uri: "file:///b", name: "b" },
        { type: "mystery" },
      ],
      structuredContent: { sum: 5 },
      isError: true,
    });
    expect(result.isError).toBe(true);
    expect(result.structured).toEqual({ sum: 5 });
    expect(result.blocks.map((b) => b.type)).toEqual([
      "text",
      "image",
      "resource",
      "link",
      "other",
    ]);
  });

  it("reads resources and prompts", () => {
    expect(
      readResourceResult({
        contents: [
          { uri: "a", text: "hello", mimeType: "text/plain" },
          { uri: "b", blob: "AAA", mimeType: "image/png" },
          { uri: "c", blob: "AAA" },
        ],
      }).map((b) => b.type),
    ).toEqual(["resource", "image", "resource"]);
    const prompt = readPromptResult({
      description: "Greets",
      messages: [{ role: "user", content: { type: "text", text: "Hi" } }],
    });
    expect(prompt).toEqual({
      description: "Greets",
      messages: [{ role: "user", block: { type: "text", text: "Hi" } }],
    });
    expect(readPromptResult(null)).toEqual({ description: null, messages: [] });
  });

  it("pretty-prints JSON text only", () => {
    expect(prettyText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyText("{not json")).toBe("{not json");
    expect(prettyText("plain")).toBe("plain");
  });
});
