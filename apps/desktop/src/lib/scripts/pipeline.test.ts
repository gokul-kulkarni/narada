import { describe, expect, it, vi } from "vitest";
import { newKeyValue, newRequest } from "../factories";
import type { HttpResponse } from "../model";
import type { PreparedRequest } from "../prepare-request";
import type { VariableScopes } from "../variables";
import { runPipeline } from "./pipeline";
import { runScript } from "./sandbox";

const response: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [],
  body: '{"token":"new"}',
  isBinary: false,
  sizeBytes: 15,
  timeMs: 3,
};
const scopes: VariableScopes = {
  global: {},
  collection: {},
  environment: { host: "a.dev" },
  data: {},
  local: {},
};

describe("runPipeline", () => {
  it("runs pre-request scripts before resolving, then tests after the response", async () => {
    const send = vi.fn(async (_request: PreparedRequest) => response);
    const request = newRequest({
      url: "https://{{host}}/{{path}}",
      headers: [newKeyValue("A", "1"), { ...newKeyValue("Off", "x"), enabled: false }],
      preRequestScript: `pm.variables.set("path", "items"); pm.request.headers.add({key: "X-Stamp", value: "{{host}}"});`,
      testScript: `pm.test("ok", () => pm.response.to.have.status(200)); pm.environment.set("token", pm.response.json().token);`,
    });
    const result = await runPipeline(
      {
        request,
        scopes,
        authChain: [],
        collectionScripts: {
          preRequest: `console.log("collection first")`,
          test: `pm.test("collection test", () => {})`,
        },
      },
      { send, execute: runScript },
    );
    expect(send.mock.calls[0][0]).toMatchObject({
      url: "https://a.dev/items",
      headers: [
        ["A", "1"],
        ["X-Stamp", "a.dev"],
      ],
    });
    expect(result.tests.map((t) => t.name)).toEqual(["collection test", "ok"]);
    expect(result.logs).toEqual(["collection first"]);
    expect(result.scopes.environment).toEqual({ host: "a.dev", token: "new" });
    expect(result.error).toBeNull();
  });

  it("stops before sending when a pre-request script throws", async () => {
    const send = vi.fn(async (_request: PreparedRequest) => response);
    const result = await runPipeline(
      {
        request: newRequest({ url: "https://a.dev", preRequestScript: "throw new Error('nope')" }),
        scopes,
        authChain: [],
      },
      { send, execute: runScript },
    );
    expect(send).not.toHaveBeenCalled();
    expect(result.error).toBe("Pre-request script error: nope");
  });

  it("keeps the response when a test script throws, and reports send failures", async () => {
    const tested = await runPipeline(
      {
        request: newRequest({ url: "https://a.dev", testScript: "boom()" }),
        scopes,
        authChain: [],
      },
      { send: async () => response, execute: runScript },
    );
    expect(tested.response).toBe(response);
    expect(tested.error).toMatch(/^Test script error: boom is not defined/);

    const failed = await runPipeline(
      { request: newRequest({ url: "https://a.dev" }), scopes, authChain: [] },
      { send: async () => Promise.reject("Could not connect"), execute: runScript },
    );
    expect(failed).toMatchObject({ response: null, error: "Could not connect" });

    const noUrl = await runPipeline(
      { request: newRequest(), scopes, authChain: [] },
      { send: async () => response, execute: runScript },
    );
    expect(noUrl.error).toBe("Enter a URL to send the request.");
  });
});
