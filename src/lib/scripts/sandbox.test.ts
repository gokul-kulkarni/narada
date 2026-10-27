import { describe, expect, it } from "vitest";
import type { HttpResponse } from "../model";
import { runScript } from "./sandbox";
import type { ScriptContext } from "./types";

const response: HttpResponse = {
  status: 201,
  statusText: "Created",
  headers: [["Content-Type", "application/json"]],
  body: '{"id":7,"token":"abc"}',
  isBinary: false,
  sizeBytes: 22,
  timeMs: 40,
};

const context = (overrides: Partial<ScriptContext> = {}): ScriptContext => ({
  request: { method: "POST", url: "{{base}}/items", headers: [["Accept", "*/*"]] },
  response,
  variables: {
    globals: { g: "1" },
    collection: { base: "https://c.dev" },
    environment: { env: "e" },
    data: {},
    local: {},
  },
  ...overrides,
});

describe("runScript", () => {
  it("runs Postman-style tests against the response", async () => {
    const result = await runScript(
      `
      pm.test("status is 201", () => pm.response.to.have.status(201));
      pm.test("is ok", () => pm.response.to.be.ok);
      pm.test("has content type", () => pm.response.to.have.header("content-type"));
      pm.test("body has id", () => pm.expect(pm.response.json().id).to.equal(7));
      pm.test("fast enough", () => pm.expect(pm.response.responseTime).to.be.below(100));
      pm.test("fails", () => pm.expect(pm.response.code).to.eql(200));
      `,
      context(),
    );
    expect(result.error).toBeNull();
    expect(result.tests.map((t) => [t.name, t.passed])).toEqual([
      ["status is 201", true],
      ["is ok", true],
      ["has content type", true],
      ["body has id", true],
      ["fast enough", true],
      ["fails", false],
    ]);
    expect(result.tests[5].error).toMatch(/expected 201 to deeply equal 200/);
  });

  it("reads and writes every variable scope without mutating the input", async () => {
    const input = context();
    const result = await runScript(
      `
      pm.environment.set("token", pm.response.json().token);
      pm.collectionVariables.set("count", 2);
      pm.globals.unset("g");
      pm.variables.set("local", "yes");
      console.log(pm.variables.get("base"), pm.environment.get("env"), pm.environment.has("nope"));
      `,
      input,
    );
    expect(result.variables.environment).toEqual({ env: "e", token: "abc" });
    expect(result.variables.collection).toEqual({ base: "https://c.dev", count: "2" });
    expect(result.variables.globals).toEqual({});
    expect(result.variables.local).toEqual({ local: "yes" });
    expect(result.logs).toEqual(["https://c.dev e false"]);
    expect(input.variables.globals).toEqual({ g: "1" });
  });

  it("lets pre-request scripts change the request", async () => {
    const result = await runScript(
      `
      pm.request.headers.add({ key: "X-Req", value: "{{env}}" });
      pm.request.headers.upsert({ key: "accept", value: "application/json" });
      pm.request.headers.remove("Nope");
      pm.request.url = pm.request.url + "?debug=1";
      `,
      context({ response: null }),
    );
    expect(result.request.url).toBe("{{base}}/items?debug=1");
    expect(result.request.headers).toEqual([
      ["accept", "application/json"],
      ["X-Req", "{{env}}"],
    ]);
  });

  it("reports script errors and async test failures", async () => {
    const thrown = await runScript("pm.test('before', () => {}); undefinedFn();", context());
    expect(thrown.error).toMatch(/undefinedFn is not defined/);
    expect(thrown.tests).toHaveLength(1);

    const asyncTest = await runScript(
      "pm.test('async', async () => { throw new Error('later'); });",
      context(),
    );
    expect(asyncTest.tests).toEqual([{ name: "async", passed: false, error: "later" }]);
  });

  it("explains response access in pre-request scripts and bad JSON", async () => {
    const noResponse = await runScript("pm.response.code", context({ response: null }));
    expect(noResponse.error).toMatch(/only available in test scripts/);
    const badJson = await runScript(
      "pm.response.json()",
      context({ response: { ...response, body: "<html>" } }),
    );
    expect(badJson.error).toMatch(/not valid JSON/);
  });

  it("exposes text, headers, status text and iteration info", async () => {
    const result = await runScript(
      `console.log(pm.response.text().length, pm.response.headers.get("CONTENT-TYPE"), pm.response.status, pm.info.iteration, pm.info.eventName);
       pm.test("header value", () => pm.response.to.have.header("Content-Type", "application/json"));
       pm.test("wrong header value", () => pm.response.to.have.header("Content-Type", "text/plain"));
       pm.test("missing header", () => pm.response.to.have.header("X-None"));`,
      context({ iteration: 2 }),
    );
    expect(result.logs).toEqual(["22 application/json Created 2 test"]);
    expect(result.tests.map((t) => t.passed)).toEqual([true, false, false]);
  });

  it("returns early for empty scripts", async () => {
    const result = await runScript("   ", context());
    expect(result).toMatchObject({ tests: [], logs: [], error: null });
  });
});
