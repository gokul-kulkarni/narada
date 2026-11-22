import { describe, expect, it } from "vitest";
import { parseQueryParams, withQueryParams } from "./url-params";

describe("parseQueryParams", () => {
  it("returns nothing when there is no query", () => {
    expect(parseQueryParams("https://x.dev/a")).toEqual([]);
  });

  it("parses keys and values, keeping {{vars}} and empty values", () => {
    expect(parseQueryParams("https://x.dev/a?q={{term}}&page=2&flag")).toEqual([
      { key: "q", value: "{{term}}" },
      { key: "page", value: "2" },
      { key: "flag", value: "" },
    ]);
  });

  it("decodes percent-encoding and ignores the fragment", () => {
    expect(parseQueryParams("/a?name=Ada%20L&x=1#top")).toEqual([
      { key: "name", value: "Ada L" },
      { key: "x", value: "1" },
    ]);
  });

  it("tolerates malformed encoding", () => {
    expect(parseQueryParams("/a?bad=%E0%A4%A")).toEqual([{ key: "bad", value: "%E0%A4%A" }]);
  });
});

describe("withQueryParams", () => {
  it("replaces the query string and keeps the fragment", () => {
    expect(withQueryParams("https://x.dev/a?old=1#frag", [{ key: "q", value: "a b" }])).toBe(
      "https://x.dev/a?q=a%20b#frag",
    );
  });

  it("does not encode {{variables}}", () => {
    expect(withQueryParams("/a", [{ key: "q", value: "{{term}}" }])).toBe("/a?q={{term}}");
  });

  it("removes the query when there are no params", () => {
    expect(withQueryParams("/a?x=1", [])).toBe("/a");
  });

  it("keeps a blank row as a bare '=' so it survives re-parsing", () => {
    expect(parseQueryParams(withQueryParams("/a", [{ key: "", value: "" }]))).toEqual([
      { key: "", value: "" },
    ]);
  });

  it("writes keys without values as bare keys", () => {
    expect(withQueryParams("/a", [{ key: "flag", value: "" }])).toBe("/a?flag");
  });
});
