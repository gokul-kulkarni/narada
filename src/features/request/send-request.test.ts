import { describe, expect, it, vi } from "vitest";
import { newRequest } from "../../lib/factories";
import type { HttpResponse } from "../../lib/model";
import type { PreparedRequest } from "../../lib/prepare-request";
import { runScript } from "../../lib/scripts/sandbox";
import type { VariableScopes } from "../../lib/variables";
import type { RequestTab } from "../../state/tabs-store";
import { sendTab } from "./send-request";

const scopes: VariableScopes = {
  global: {},
  collection: {},
  environment: { host: "a.dev" },
  data: {},
  local: {},
};
const response: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [],
  body: "{}",
  isBinary: false,
  sizeBytes: 2,
  timeMs: 5,
};

const tabWith = (overrides: Partial<RequestTab["request"]>): RequestTab => ({
  id: "t1",
  request: newRequest(overrides),
  source: null,
  dirty: false,
  loading: false,
  response: null,
  error: null,
  tests: [],
  logs: [],
});

function deps(send: (r: PreparedRequest) => Promise<HttpResponse>) {
  return {
    send: vi.fn(send),
    execute: runScript,
    getInput: () => ({ scopes, authChain: [] }),
    applyScopes: vi.fn(
      async (_tab: RequestTab, _before: VariableScopes, _after: VariableScopes) => undefined,
    ),
    patchTab: vi.fn(),
    addHistory: vi.fn(),
    now: () => new Date("2026-01-01T00:00:00Z"),
  };
}

describe("sendTab", () => {
  it("sends, runs tests, applies variable changes and records history", async () => {
    const d = deps(async () => response);
    await sendTab(
      tabWith({
        url: "https://{{host}}/x",
        testScript: `pm.test("ok", () => {}); pm.environment.set("t", "1")`,
      }),
      d,
    );
    expect(d.send.mock.calls[0][0].url).toBe("https://a.dev/x");
    expect(d.patchTab).toHaveBeenNthCalledWith(1, "t1", {
      loading: true,
      error: null,
      tests: [],
      logs: [],
    });
    expect(d.patchTab).toHaveBeenLastCalledWith("t1", {
      loading: false,
      response,
      error: null,
      tests: [{ name: "ok", passed: true }],
      logs: [],
    });
    expect(d.applyScopes.mock.calls[0][2]).toMatchObject({
      environment: { host: "a.dev", t: "1" },
    });
    expect(d.addHistory.mock.calls[0][0]).toMatchObject({
      status: 200,
      timeMs: 5,
      sentAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("reports errors on the tab and still records history", async () => {
    const d = deps(async () => Promise.reject("Could not connect"));
    await sendTab(tabWith({ url: "https://a.dev" }), d);
    expect(d.patchTab).toHaveBeenLastCalledWith(
      "t1",
      expect.objectContaining({ response: null, error: "Could not connect" }),
    );
    expect(d.addHistory.mock.calls[0][0]).toMatchObject({ status: null });
  });
});
