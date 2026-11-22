import { describe, expect, it } from "vitest";
import { parseGlobals } from "./globals";

describe("parseGlobals", () => {
  it("keeps rows with a string key and value", () => {
    const rows = [
      { id: "1", key: "host", value: "localhost", enabled: true },
      { key: 3, value: "x" },
      null,
    ];
    expect(parseGlobals(JSON.stringify(rows))).toEqual([rows[0]]);
  });

  it("treats missing, invalid or non-array content as no globals", () => {
    expect(parseGlobals(null)).toEqual([]);
    expect(parseGlobals("{nope")).toEqual([]);
    expect(parseGlobals('{"a":1}')).toEqual([]);
  });
});
