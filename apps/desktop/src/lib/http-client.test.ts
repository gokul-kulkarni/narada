import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedRequest } from "@narada/core/prepare-request";
import { STOPPED_MESSAGE } from "@narada/core/stream/stream-state";

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  channels: [] as { onmessage: (event: unknown) => void }[],
}));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: tauri.isTauri,
  invoke: tauri.invoke,
  Channel: class {
    onmessage: (event: unknown) => void = () => {};
    constructor() {
      tauri.channels.push(this);
    }
  },
}));

const { sendHttp } = await import("./http-client");

const request: PreparedRequest = {
  method: "POST",
  url: "http://localhost:1976/v1/chat/completions",
  headers: [["content-type", "application/json"]],
  body: { type: "text", content: "{}" },
  timeoutMs: 1000,
};

afterEach(() => {
  vi.unstubAllGlobals();
  tauri.isTauri.mockReturnValue(false);
  tauri.invoke.mockReset();
  tauri.channels.length = 0;
});

describe("sendHttp in the browser", () => {
  it("sends with fetch outside the desktop shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 201 })),
    );
    const response = await sendHttp(request);
    expect(response).toMatchObject({ status: 201, body: "ok", incomplete: null });
  });
});

describe("sendHttp in the desktop app", () => {
  it("streams events from the Rust command", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command !== "send_request") return;
      const channel = tauri.channels[0];
      channel.onmessage({ kind: "head", status: 200, statusText: "OK", headers: [] });
      channel.onmessage({ kind: "chunk", text: "hi", bytes: 2, atMs: 3 });
      channel.onmessage({
        kind: "end",
        sizeBytes: 2,
        timeMs: 4,
        isBinary: false,
        incomplete: null,
      });
    });
    const controller = new AbortController();
    const onProgress = vi.fn();
    const response = await sendHttp(request, { onProgress, signal: controller.signal });

    expect(response).toMatchObject({ status: 200, body: "hi", timeMs: 4 });
    expect(onProgress).toHaveBeenCalledTimes(2);
    const [, args] = tauri.invoke.mock.calls[0];
    expect(args).toMatchObject({ request, channel: tauri.channels[0] });
  });

  it("asks Rust to cancel when the signal aborts", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === "send_request") {
        const channel = tauri.channels[0];
        channel.onmessage({ kind: "head", status: 200, statusText: "OK", headers: [] });
        controller.abort();
        channel.onmessage({
          kind: "end",
          sizeBytes: 0,
          timeMs: 1,
          isBinary: false,
          incomplete: STOPPED_MESSAGE,
        });
      }
    });
    const controller = new AbortController();
    const response = await sendHttp(request, { signal: controller.signal });
    expect(response.incomplete).toBe(STOPPED_MESSAGE);
    const sendId = tauri.invoke.mock.calls[0][1].id;
    expect(tauri.invoke).toHaveBeenCalledWith("cancel_request", { id: sendId });
  });
});
