import { describe, expect, it } from "vitest";
import { parseCurl, tokenizeShell } from "./curl";

describe("tokenizeShell", () => {
  it("handles quotes, escapes and line continuations", () => {
    expect(tokenizeShell(`curl 'a b' "c \\"d\\"" e\\ f \\\n  -s`)).toEqual([
      "curl",
      "a b",
      'c "d"',
      "e f",
      "-s",
    ]);
  });

  it("rejects unterminated quotes", () => {
    expect(() => tokenizeShell("curl 'oops")).toThrow(/unterminated/i);
  });
});

describe("parseCurl", () => {
  it("parses method, url, headers and a JSON body", () => {
    const request = parseCurl(
      `curl -X PUT 'https://api.dev/pets/1' -H 'Content-Type: application/json' -H "X-Trace: 1" --data-raw '{"name":"Rex"}' --compressed`,
    );
    expect(request).toMatchObject({
      method: "PUT",
      url: "https://api.dev/pets/1",
      name: "https://api.dev/pets/1",
    });
    expect(request.headers.map((h) => [h.key, h.value])).toEqual([
      ["Content-Type", "application/json"],
      ["X-Trace", "1"],
    ]);
    expect(request.body).toEqual({ mode: "raw", raw: '{"name":"Rex"}', language: "json" });
  });

  it("defaults to POST with form data and parses it as urlencoded", () => {
    const request = parseCurl("curl https://a.dev/login -d 'user=ada&pw=a%20b' -d extra=1");
    expect(request.method).toBe("POST");
    expect(request.body).toMatchObject({
      mode: "urlencoded",
      fields: [
        { key: "user", value: "ada" },
        { key: "pw", value: "a b" },
        { key: "extra", value: "1" },
      ],
    });
  });

  it("parses multipart forms, basic auth, user agent and cookies", () => {
    const request = parseCurl(
      "curl --url https://a.dev -F name=Ada -F 'age=36' -u ada:pw -A Agent/1 -b 'a=1'",
    );
    expect(request.method).toBe("POST");
    expect(request.body).toMatchObject({
      mode: "formdata",
      fields: [
        { key: "name", value: "Ada" },
        { key: "age", value: "36" },
      ],
    });
    expect(request.auth).toEqual({ type: "basic", username: "ada", password: "pw" });
    expect(request.headers.map((h) => [h.key, h.value])).toEqual([
      ["User-Agent", "Agent/1"],
      ["Cookie", "a=1"],
    ]);
  });

  it("supports --flag=value, -XPOST and -G", () => {
    const request = parseCurl("curl -XDELETE --header=Accept:text/plain https://a.dev");
    expect(request.method).toBe("DELETE");
    expect(request.headers[0]).toMatchObject({ key: "Accept", value: "text/plain" });
    const get = parseCurl("curl -G https://a.dev/s -d q=x");
    expect(get).toMatchObject({
      method: "GET",
      url: "https://a.dev/s?q=x",
      body: { mode: "none" },
    });
  });

  it("keeps non-form text bodies raw", () => {
    expect(
      parseCurl("curl https://a.dev -H 'Content-Type: text/plain' --data-binary hello").body,
    ).toEqual({
      mode: "raw",
      raw: "hello",
      language: "text",
    });
  });

  it("rejects things that are not curl commands", () => {
    expect(() => parseCurl("wget https://a.dev")).toThrow(/curl/);
    expect(() => parseCurl("curl -s")).toThrow(/URL/);
  });
});
