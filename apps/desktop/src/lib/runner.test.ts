import { describe, expect, it, vi } from "vitest";
import { newRequest } from "./factories";
import type { HttpResponse } from "./model";
import type { PreparedRequest } from "./prepare-request";
import { iterationCount, runCollection, summarizeRun } from "./runner";
import { runScript } from "./scripts/sandbox";

const ok = (status = 200): HttpResponse => ({
  status,
  statusText: "",
  headers: [],
  body: '{"n":1}',
  isBinary: false,
  sizeBytes: 1,
  timeMs: 1,
});
const scopes = { global: {}, collection: {}, environment: { host: "a.dev" }, data: {}, local: {} };

describe("runCollection", () => {
  it("runs steps per data row, threading variables between requests", async () => {
    const send = vi.fn(async (r: PreparedRequest) => ok(r.url.endsWith("/bob") ? 404 : 200));
    const login = newRequest({
      name: "login",
      url: "https://{{host}}/login",
      testScript: `pm.environment.set("step", "logged-in")`,
    });
    const get = newRequest({
      name: "get",
      url: "https://{{host}}/users/{{user}}",
      testScript: `pm.test("found", () => pm.response.to.have.status(200)); pm.test("saw login", () => pm.expect(pm.environment.get("step")).to.equal("logged-in"));`,
    });
    const onRow = vi.fn();
    const result = await runCollection(
      {
        steps: [
          { request: login, authChain: [] },
          { request: get, authChain: [] },
        ],
        iterations: 1,
        data: [{ user: "ada" }, { user: "bob" }],
        scopes,
      },
      { send, execute: runScript, onRow },
    );
    expect(send.mock.calls.map(([r]) => r.url)).toEqual([
      "https://a.dev/login",
      "https://a.dev/users/ada",
      "https://a.dev/login",
      "https://a.dev/users/bob",
    ]);
    expect(onRow).toHaveBeenCalledTimes(4);
    expect(result.scopes.environment).toEqual({ host: "a.dev", step: "logged-in" });
    expect(result.scopes.data).toEqual({});
    expect(summarizeRun(result.rows)).toEqual({ requests: 4, errors: 0, passed: 3, failed: 1 });
  });

  it("can be stopped and waits between requests", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const result = await runCollection(
      {
        steps: [{ request: newRequest({ url: "https://a.dev" }), authChain: [] }],
        iterations: 5,
        data: [],
        scopes,
        delayMs: 10,
        isStopped: () => calls >= 2,
      },
      { send: async () => (calls++, ok()), execute: runScript, sleep },
    );
    expect(result).toMatchObject({ stopped: true });
    expect(result.rows).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("counts iterations", () => {
    expect(iterationCount(0, [])).toBe(1);
    expect(iterationCount(3, [{}])).toBe(3);
    expect(iterationCount(1, [{}, {}])).toBe(2);
  });
});
