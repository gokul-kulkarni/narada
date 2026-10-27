import { describe, expect, it } from "vitest";
import { parseCsv, parseDataFile } from "./data-file";

describe("data files", () => {
  it("parses CSV with quotes, commas and CRLF", () => {
    expect(parseCsv('name,note\r\nAda,"says ""hi"", twice"\r\nBob,\n\n')).toEqual([
      { name: "Ada", note: 'says "hi", twice' },
      { name: "Bob", note: "" },
    ]);
    expect(parseCsv("")).toEqual([]);
    expect(() => parseCsv('a\n"open')).toThrow(/unterminated/);
  });

  it("parses JSON arrays and rejects other shapes", () => {
    expect(parseDataFile('[{"id":1,"name":"x"}]', "data.JSON")).toEqual([{ id: "1", name: "x" }]);
    expect(() => parseDataFile('{"a":1}', "d.json")).toThrow(/array of objects/);
    expect(parseDataFile("a\n1", "d.csv")).toEqual([{ a: "1" }]);
  });
});
