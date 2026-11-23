import { describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "../factories";
import type { Auth, HttpRequestDef, HttpResponse } from "../model";
import { buildAgentContext } from "./context";
import type { SecretValue } from "./types";

const response = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 500,
  statusText: "Internal Server Error",
  headers: [["Content-Type", "application/json"]],
  body: '{"error":"boom"}',
  isBinary: false,
  sizeBytes: 16,
  timeMs: 12,
  timeline: [{ atMs: 1, end: 16 }],
  ...overrides,
});

describe("buildAgentContext", () => {
  it("builds an HTTP context without the stream timeline", () => {
    const ctx = buildAgentContext({
      request: newRequest({ url: "{{baseUrl}}/x" }),
      result: { delivery: { protocol: "http", response: response() } },
      tests: [{ name: "is 200", passed: false, error: "expected 500 to equal 200" }],
      environment: "dev",
      variableNames: ["token", "baseUrl", "baseUrl"],
      secrets: [],
    });
    expect(ctx.outcome).toEqual({
      kind: "http",
      response: {
        status: 500,
        statusText: "Internal Server Error",
        headers: [["Content-Type", "application/json"]],
        body: '{"error":"boom"}',
        isBinary: false,
        sizeBytes: 16,
        timeMs: 12,
        incomplete: null,
      },
    });
    expect(ctx.variableNames).toEqual(["baseUrl", "token"]);
    expect(ctx.question).toBeNull();
  });

  it("drops binary bodies", () => {
    const ctx = buildAgentContext({
      request: newRequest(),
      result: {
        delivery: { protocol: "http", response: response({ isBinary: true, body: "AAAA" }) },
      },
      tests: [],
      environment: null,
      variableNames: [],
      secrets: [],
    });
    if (ctx.outcome.kind !== "http") throw new Error();
    expect(ctx.outcome.response.body).toBe("");
  });

  it("builds an MCP context", () => {
    const ctx = buildAgentContext({
      request: {
        protocol: "mcp",
        id: "r",
        name: "n",
        serverId: "s",
        operation: { type: "resource", uri: "u" },
      },
      result: {
        delivery: {
          protocol: "mcp",
          operation: "resource",
          result: { ok: true },
          isError: false,
          timeMs: 4,
        },
      },
      tests: [],
      environment: null,
      variableNames: [],
      secrets: [],
      question: "  what does this mean?  ",
    });
    expect(ctx.outcome).toEqual({
      kind: "mcp",
      operation: "resource",
      result: { ok: true },
      isError: false,
      timeMs: 4,
    });
    expect(ctx.question).toBe("what does this mean?");
  });

  it("builds a context for a request that never arrived", () => {
    const ctx = buildAgentContext({
      request: newRequest(),
      result: { error: "connection refused" },
      tests: [],
      environment: null,
      variableNames: [],
      secrets: [],
      question: "   ",
    });
    expect(ctx.outcome).toEqual({ kind: "not-delivered", message: "connection refused" });
    expect(ctx.question).toBeNull();
  });
});

/** mulberry32: small seeded PRNG so the property test is reproducible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~+/=";

describe("buildAgentContext never leaks a known secret", () => {
  it.each(Array.from({ length: 200 }, (_, i) => i + 1))("seed %i", (seed) => {
    const next = rng(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
    const secret = Array.from({ length: 6 + Math.floor(next() * 40) }, () =>
      pick([...ALPHABET]),
    ).join("");
    const secrets: SecretValue[] = [{ name: pick(["token", null]), value: secret }];
    const embed = (text: string) => (next() < 0.5 ? `${text}${secret}${text}` : text);

    const auths: Auth[] = [
      { type: "bearer", token: embed("") },
      { type: "basic", username: embed("u"), password: embed("p") },
      { type: "apikey", key: "X-Key", value: embed(""), in: "query" },
    ];
    const request: HttpRequestDef = newRequest({
      url: `https://api.dev/${embed("p")}?q=${embed("v")}`,
      headers: [newKeyValue(pick(["X-Custom", "Accept", "Authorization"]), embed("h"))],
      body: { mode: "raw", raw: `{"note":"${embed("n")}"}`, language: "json" },
      auth: pick(auths),
      preRequestScript: `pm.environment.set("x", "${embed("s")}")`,
      testScript: embed("t"),
    });
    const body =
      "x".repeat(Math.floor(next() * 50_000)) +
      embed("b") +
      "y".repeat(Math.floor(next() * 50_000));

    const ctx = buildAgentContext({
      request,
      result: pick([
        {
          delivery: {
            protocol: "http" as const,
            response: response({ body, headers: [["X-Echo", embed("e")]] }),
          },
        },
        { error: `failed ${embed("e")}` },
      ]),
      tests: [{ name: embed("n"), passed: false, error: embed("e") }],
      environment: "dev",
      variableNames: [],
      secrets,
      question: embed("q"),
    });
    expect(JSON.stringify(ctx)).not.toContain(secret);
  });
});
