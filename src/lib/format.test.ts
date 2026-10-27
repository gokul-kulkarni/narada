import { describe, expect, it } from "vitest";
import { errorMessage, findHeader, formatBytes, formatDuration, prettyBody } from "./format";

describe("format helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("formats durations", () => {
    expect(formatDuration(120)).toBe("120 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
  });

  it("finds headers case-insensitively", () => {
    expect(findHeader([["Content-Type", "a"]], "content-type")).toBe("a");
    expect(findHeader([], "x")).toBeUndefined();
  });

  it("pretty-prints JSON and leaves everything else alone", () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyBody("{broken", "application/json")).toBe("{broken");
    expect(prettyBody("<p>hi</p>", "text/html")).toBe("<p>hi</p>");
  });

  it("extracts error messages", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("Unknown error");
  });
});
