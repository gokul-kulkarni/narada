import { describe, expect, it, vi } from "vitest";
import { newRequest } from "../../lib/factories";
import type { HttpResponse } from "../../lib/model";
import type { VariableScopes } from "../../lib/variables";
import type { RequestTab } from "../../state/tabs-store";
import { sendTab, type SendDeps } from "./send-request";

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

const tabWith = (url: string): RequestTab => ({
  id: "t1",
  request: newRequest({ url }),
  source: null,
  dirty: false,
  loading: false,
  response: null,
  error: null,
});

function deps(send: SendDeps["send"]) {
  return {
    send: vi.fn(send),
    getContext: () => ({ scopes, authChain: [] }),
    patchTab: vi.fn(),
    addHistory: vi.fn(),
    now: () => new Date("2026-01-01T00:00:00Z"),
  };
}

describe("sendTab", () => {
  it("sends the prepared request and records the response and history", async () => {
    const d = deps(async () => response);
    await sendTab(tabWith("https://{{host}}/x"), d);
    expect(d.send.mock.calls[0][0].url).toBe("https://a.dev/x");
    expect(d.patchTab).toHaveBeenNthCalledWith(1, "t1", { loading: true, error: null });
    expect(d.patchTab).toHaveBeenLastCalledWith("t1", { loading: false, response });
    expect(d.addHistory.mock.calls[0][0]).toMatchObject({
      status: 200,
      timeMs: 5,
      sentAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("reports errors on the tab", async () => {
    const d = deps(async () => {
      throw "Could not connect";
    });
    await sendTab(tabWith("https://a.dev"), d);
    expect(d.patchTab).toHaveBeenLastCalledWith("t1", {
      loading: false,
      response: null,
      error: "Could not connect",
    });
    expect(d.addHistory.mock.calls[0][0]).toMatchObject({ status: null });
  });

  it("refuses to send without a URL", async () => {
    const d = deps(async () => response);
    await sendTab(tabWith("  "), d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.patchTab).toHaveBeenLastCalledWith(
      "t1",
      expect.objectContaining({ error: "Enter a URL to send the request." }),
    );
  });
});
