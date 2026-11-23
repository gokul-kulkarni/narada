import { describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "../factories";
import { applyPatch, describeChanges, extractPatch, stripPatch } from "./patch";

const block = (json: unknown) =>
  ["Here is the fix.", "", "```narada-patch", JSON.stringify(json), "```"].join("\n");

const request = () =>
  newRequest({
    method: "GET",
    url: "{{baseUrl}}/orders",
    headers: [
      newKeyValue("Authorization", "Bearer {{token}}"),
      newKeyValue("Accept", "*/*"),
      { ...newKeyValue("X-Off", "1"), enabled: false },
    ],
  });

describe("extractPatch", () => {
  it("finds no patch in an answer without one", () => {
    expect(extractPatch("Just an explanation.")).toBeNull();
  });

  it("reads the last narada-patch block", () => {
    const text = `${block({ url: "a" })}\n\nActually:\n\n${block({ method: "POST" })}`;
    expect(extractPatch(text)).toEqual({ patch: { method: "POST" }, warnings: [] });
  });

  it("rejects blocks that are not JSON, have the wrong shape or change nothing", () => {
    for (const bad of [
      "```narada-patch\nnot json\n```",
      block({ method: "FETCH" }),
      block({}),
      block([1]),
    ]) {
      expect(extractPatch(bad)).toEqual({
        patch: null,
        warnings: [expect.stringMatching(/couldn't be read/)],
      });
    }
  });

  it("ignores fields it does not change, such as auth", () => {
    expect(extractPatch(block({ method: "PUT", auth: { type: "bearer", token: "x" } }))).toEqual({
      patch: { method: "PUT" },
      warnings: [],
    });
  });

  it("turns secret placeholders back into variables", () => {
    const result = extractPatch(
      block({
        url: "https://x.dev/a?key=[secret:apiKey]",
        headers: [{ key: "X-Api-Key", value: "[secret:apiKey]" }],
        body: { mode: "raw", language: "json", raw: '{"k":"[secret:apiKey]"}' },
      }),
    );
    expect(result?.patch).toEqual({
      url: "https://x.dev/a?key={{apiKey}}",
      headers: [{ key: "X-Api-Key", value: "{{apiKey}}" }],
      body: { mode: "raw", language: "json", raw: '{"k":"{{apiKey}}"}' },
    });
  });

  it("drops a URL or body that still holds a redacted value, and says so", () => {
    const result = extractPatch(
      block({
        method: "POST",
        url: "https://x.dev?k=[redacted]",
        body: { mode: "raw", raw: "[redacted]" },
      }),
    );
    expect(result?.patch).toEqual({ method: "POST" });
    expect(result?.warnings).toHaveLength(2);
  });
});

describe("stripPatch", () => {
  it("removes patch blocks from the text shown to the user", () => {
    expect(stripPatch(block({ method: "POST" }))).toBe("Here is the fix.");
    expect(stripPatch("No patch here.")).toBe("No patch here.");
  });
});

describe("applyPatch", () => {
  it("changes method, URL and body, and returns a new request", () => {
    const before = request();
    const after = applyPatch(before, {
      method: "POST",
      url: "{{baseUrl}}/orders/new",
      body: { mode: "raw", language: "json", raw: '{"qty":1}' },
    });
    expect(after).toMatchObject({
      method: "POST",
      url: "{{baseUrl}}/orders/new",
      body: { mode: "raw", language: "json", raw: '{"qty":1}' },
    });
    expect(before.method).toBe("GET");
  });

  it("sets headers by name, keeps a redacted value as it was, and removes headers", () => {
    const after = applyPatch(request(), {
      headers: [
        { key: "accept", value: "application/json" },
        { key: "Authorization", value: "Bearer [redacted]" },
        { key: "Content-Type", value: "application/json" },
        { key: "X-New-Secret", value: "[redacted]" },
      ],
      removeHeaders: ["x-off"],
    });
    if (after.protocol !== "http") throw new Error();
    expect(after.headers.map((h) => [h.key, h.value, h.enabled])).toEqual([
      ["Authorization", "Bearer {{token}}", true],
      ["Accept", "application/json", true],
      ["Content-Type", "application/json", true],
    ]);
  });

  it("turns url-encoded and form fields into enabled rows", () => {
    const after = applyPatch(request(), {
      body: { mode: "urlencoded", fields: [{ key: "qty", value: "1" }] },
    });
    if (after.protocol !== "http" || after.body.mode !== "urlencoded") throw new Error();
    expect(after.body.fields.map((f) => [f.key, f.value, f.enabled])).toEqual([["qty", "1", true]]);
  });
});

describe("describeChanges", () => {
  it("lists what differs between two requests", () => {
    const before = request();
    const after = applyPatch(before, {
      method: "POST",
      headers: [
        { key: "Accept", value: "application/json" },
        { key: "Content-Type", value: "application/json" },
      ],
      removeHeaders: ["Authorization"],
      body: { mode: "raw", language: "json", raw: '{"qty":1}' },
    });
    expect(describeChanges(before, after)).toEqual([
      { label: "Method", before: "GET", after: "POST" },
      { label: "Header Authorization", before: "Bearer {{token}}", after: null },
      { label: "Header Accept", before: "*/*", after: "application/json" },
      { label: "Header Content-Type", before: null, after: "application/json" },
      { label: "Body", before: "none", after: 'raw (json)\n{"qty":1}' },
    ]);
  });

  it("is empty when nothing changed", () => {
    const same = request();
    expect(describeChanges(same, applyPatch(same, { url: same.url }))).toEqual([]);
  });
});
