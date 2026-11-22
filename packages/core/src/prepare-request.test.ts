import { describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "./factories";
import { prepareRequest } from "./prepare-request";
import type { VariableScopes } from "./variables";

const scopes: VariableScopes = {
  global: {},
  collection: { base: "https://api.dev" },
  environment: { token: "secret", id: "42" },
  data: {},
  local: {},
};

describe("prepareRequest", () => {
  it("resolves variables in url, headers, body and auth", () => {
    const request = newRequest({
      method: "POST",
      url: "{{base}}/users/{{id}}",
      headers: [newKeyValue("X-Id", "{{id}}"), { ...newKeyValue("X-Off", "1"), enabled: false }],
      body: { mode: "raw", raw: '{"id":"{{id}}"}', language: "json" },
      auth: { type: "bearer", token: "{{token}}" },
    });
    expect(prepareRequest(request, { scopes, authChain: [] })).toEqual({
      method: "POST",
      url: "https://api.dev/users/42",
      headers: [
        ["X-Id", "42"],
        ["Content-Type", "application/json"],
        ["Authorization", "Bearer secret"],
      ],
      body: { type: "text", content: '{"id":"42"}' },
      timeoutMs: 30000,
    });
  });

  it("adds http:// when the scheme is missing, like Postman", () => {
    const prepared = prepareRequest(newRequest({ url: "example.com" }), { scopes, authChain: [] });
    expect(prepared.url).toBe("http://example.com");
  });

  it("keeps an explicit Content-Type", () => {
    const request = newRequest({
      headers: [newKeyValue("content-type", "text/csv")],
      body: { mode: "raw", raw: "a,b", language: "text" },
    });
    expect(prepareRequest(request, { scopes, authChain: [] }).headers).toEqual([
      ["content-type", "text/csv"],
    ]);
  });

  it("url-encodes urlencoded bodies", () => {
    const request = newRequest({
      body: { mode: "urlencoded", fields: [newKeyValue("q", "a b&{{id}}")] },
    });
    const prepared = prepareRequest(request, { scopes, authChain: [] });
    expect(prepared.body).toEqual({ type: "text", content: "q=a+b%2642" });
    expect(prepared.headers).toContainEqual(["Content-Type", "application/x-www-form-urlencoded"]);
  });

  it("sends form-data as multipart without forcing a Content-Type", () => {
    const request = newRequest({
      body: { mode: "formdata", fields: [newKeyValue("f", "{{id}}")] },
    });
    const prepared = prepareRequest(request, { scopes, authChain: [] });
    expect(prepared.body).toEqual({ type: "multipart", fields: [["f", "42"]] });
    expect(prepared.headers).toEqual([]);
  });

  it("inherits auth from the parent chain", () => {
    const request = newRequest({ url: "https://a.dev" });
    const prepared = prepareRequest(request, {
      scopes,
      authChain: [{ type: "inherit" }, { type: "bearer", token: "{{token}}" }],
    });
    expect(prepared.headers).toEqual([["Authorization", "Bearer secret"]]);
  });

  it("drops headers with empty keys and sends no body for none", () => {
    const request = newRequest({ url: "https://a.dev", headers: [newKeyValue("", "x")] });
    const prepared = prepareRequest(request, { scopes, authChain: [] });
    expect(prepared.headers).toEqual([]);
    expect(prepared.body).toEqual({ type: "none" });
  });
});
