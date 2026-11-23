import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "@narada/core/factories";
import type { HttpResponse } from "@narada/core/model";
import type { RequestTab } from "../../state/tabs-store";
import { isFailing, promptForTab, type WorkspaceSnapshot } from "./agent-context";

const response = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 422,
  statusText: "Unprocessable Entity",
  headers: [["Content-Type", "application/json"]],
  body: '{"error":"bad key sk-env-secret-123","echo":"glob-token-value"}',
  isBinary: false,
  sizeBytes: 60,
  timeMs: 40,
  ...overrides,
});

const tab = (overrides: Partial<RequestTab> = {}): RequestTab => ({
  id: "tab-1",
  request: newRequest({ method: "POST", url: "{{baseUrl}}/orders" }),
  source: null,
  dirty: false,
  loading: false,
  partial: null,
  delivery: { protocol: "http", response: response() },
  error: null,
  tests: [],
  logs: [],
  ...overrides,
});

const environment = {
  ...newEnvironment("staging"),
  variables: [
    { ...newKeyValue("baseUrl", "https://staging.dev"), secret: false },
    { ...newKeyValue("apiKey", "sk-env-secret-123"), secret: true },
    { ...newKeyValue("unused", "x"), secret: false, enabled: false },
  ],
};

const workspace = (overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot => ({
  collections: [],
  environments: [environment],
  globals: [newKeyValue("authToken", "glob-token-value")],
  activeEnvironmentId: environment.id,
  ...overrides,
});

describe("isFailing", () => {
  it("is true for errors, 4xx/5xx, MCP tool errors and failed tests", () => {
    expect(isFailing(tab())).toBe(true);
    expect(isFailing(tab({ delivery: null, error: "connection refused" }))).toBe(true);
    expect(
      isFailing(
        tab({
          delivery: { protocol: "mcp", operation: "tool", result: {}, isError: true, timeMs: 1 },
        }),
      ),
    ).toBe(true);
    expect(
      isFailing(
        tab({
          delivery: { protocol: "http", response: response({ status: 200 }) },
          tests: [{ name: "t", passed: false, error: "no" }],
        }),
      ),
    ).toBe(true);
  });

  it("is false for a passing response or nothing sent yet", () => {
    expect(
      isFailing(tab({ delivery: { protocol: "http", response: response({ status: 200 }) } })),
    ).toBe(false);
    expect(isFailing(tab({ delivery: null }))).toBe(false);
  });
});

describe("promptForTab", () => {
  it("is null before anything was sent", () => {
    expect(promptForTab(tab({ delivery: null }), workspace())).toBeNull();
  });

  it("describes the failure without secret or sensitive variable values", () => {
    const prompt = promptForTab(tab(), workspace()) ?? "";
    expect(prompt).toContain("POST {{baseUrl}}/orders");
    expect(prompt).toContain("422 Unprocessable Entity");
    expect(prompt).toContain("Environment: staging");
    expect(prompt).toContain("apiKey, authToken, baseUrl");
    expect(prompt).not.toContain("unused");
    expect(prompt).not.toContain("sk-env-secret-123");
    expect(prompt).not.toContain("glob-token-value");
    expect(prompt).toContain("[secret:apiKey]");
  });

  it("includes collection variables of a saved request and the user's question", () => {
    const collection = { ...newCollection("Shop"), variables: [newKeyValue("shopId", "42")] };
    const prompt =
      promptForTab(
        tab({ source: { collectionId: collection.id, requestId: "r" } }),
        workspace({ collections: [collection], activeEnvironmentId: null }),
        "Is the body right?",
      ) ?? "";
    expect(prompt).toContain("Environment: none");
    expect(prompt).toContain("authToken, shopId");
    expect(prompt).toContain("Is the body right?");
  });

  it("describes a request that never arrived", () => {
    const prompt = promptForTab(tab({ delivery: null, error: "ECONNREFUSED" }), workspace()) ?? "";
    expect(prompt).toContain("Not delivered");
    expect(prompt).toContain("ECONNREFUSED");
  });
});
