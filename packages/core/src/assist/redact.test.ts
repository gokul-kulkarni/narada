import { describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "../factories";
import type { Auth, McpRequestDef } from "../model";
import { redactAuth, redactContext } from "./redact";
import { REDACTED } from "./scrub";
import type { AgentContext } from "./types";

const baseContext = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  request: newRequest({ url: "{{baseUrl}}/users" }),
  outcome: { kind: "not-delivered", message: "connection refused" },
  tests: [],
  environment: "dev",
  variableNames: ["baseUrl"],
  question: null,
  ...overrides,
});

describe("redactAuth", () => {
  it.each<[Auth, Auth]>([
    [{ type: "inherit" }, { type: "inherit" }],
    [{ type: "none" }, { type: "none" }],
    [
      { type: "basic", username: "ann", password: "pw" },
      { type: "basic", username: "ann", password: REDACTED },
    ],
    [
      { type: "bearer", token: "{{token}}" },
      { type: "bearer", token: "{{token}}" },
    ],
    [
      { type: "apikey", key: "X-Key", value: "v", in: "header" },
      { type: "apikey", key: "X-Key", value: REDACTED, in: "header" },
    ],
    [
      {
        type: "oauth2",
        tokenUrl: "https://a/token",
        clientId: "cid",
        clientSecret: "cs",
        scope: "read",
        accessToken: "at",
      },
      {
        type: "oauth2",
        tokenUrl: "https://a/token",
        clientId: "cid",
        clientSecret: REDACTED,
        scope: "read",
        accessToken: REDACTED,
      },
    ],
  ])("redacts %o", (auth, expected) => {
    expect(redactAuth(auth)).toEqual(expected);
  });
});

describe("redactContext", () => {
  it("hides sensitive request headers, body fields and auth", () => {
    const request = newRequest({
      headers: [newKeyValue("Authorization", "Bearer abc"), newKeyValue("Accept", "*/*")],
      body: { mode: "urlencoded", fields: [newKeyValue("password", "pw"), newKeyValue("u", "a")] },
      auth: { type: "bearer", token: "abc" },
    });
    const out = redactContext(baseContext({ request }), []);
    expect(out.request.protocol).toBe("http");
    if (out.request.protocol !== "http" || out.request.body.mode !== "urlencoded")
      throw new Error();
    expect(out.request.headers.map((h) => h.value)).toEqual([REDACTED, "*/*"]);
    expect(out.request.body.fields.map((f) => f.value)).toEqual([REDACTED, "a"]);
    expect(out.request.auth).toEqual({ type: "bearer", token: REDACTED });
  });

  it("hides sensitive response headers and secret values in the body", () => {
    const out = redactContext(
      baseContext({
        outcome: {
          kind: "http",
          response: {
            status: 401,
            statusText: "Unauthorized",
            headers: [
              ["Set-Cookie", "sid=1"],
              ["Content-Type", "application/json"],
            ],
            body: '{"error":"bad key sk-live-1234567890"}',
            isBinary: false,
            sizeBytes: 10,
            timeMs: 5,
            incomplete: null,
          },
        },
      }),
      [{ name: "apiKey", value: "sk-live-1234567890" }],
    );
    if (out.outcome.kind !== "http") throw new Error();
    expect(out.outcome.response.headers).toEqual([
      ["Set-Cookie", REDACTED],
      ["Content-Type", "application/json"],
    ]);
    expect(out.outcome.response.body).toBe('{"error":"bad key [secret:apiKey]"}');
  });

  it("hides sensitive MCP tool arguments and secrets in results", () => {
    const request: McpRequestDef = {
      protocol: "mcp",
      id: "r",
      name: "call",
      serverId: "s",
      operation: { type: "tool", name: "login", arguments: { user: "ann", password: "pw" } },
    };
    const out = redactContext(
      baseContext({
        request,
        outcome: {
          kind: "mcp",
          operation: "tool",
          result: { content: [{ type: "text", text: "key remembered-key-xyz" }] },
          isError: true,
          timeMs: 3,
        },
      }),
      [{ name: null, value: "remembered-key-xyz" }],
    );
    expect(out.request).toMatchObject({
      operation: { arguments: { user: "ann", password: REDACTED } },
    });
    expect(JSON.stringify(out.outcome)).not.toContain("remembered-key-xyz");
  });

  it("scrubs secrets from the error message, tests and question", () => {
    const out = redactContext(
      baseContext({
        outcome: { kind: "not-delivered", message: "bad sk-live-1234567890" },
        tests: [{ name: "t", passed: false, error: "got sk-live-1234567890" }],
        question: "why does sk-live-1234567890 fail?",
      }),
      [{ name: "apiKey", value: "sk-live-1234567890" }],
    );
    expect(JSON.stringify(out)).not.toContain("sk-live-1234567890");
  });
});
