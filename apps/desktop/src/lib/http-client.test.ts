import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedRequest } from "./prepare-request";
import { STOPPED_MESSAGE } from "./stream/stream-state";

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

const encoder = new TextEncoder();

/** A body stream whose pieces the test pushes in by hand. */
function controllableBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    stream,
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: () => controller.error(new Error("aborted")),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  tauri.isTauri.mockReturnValue(false);
  tauri.invoke.mockReset();
  tauri.channels.length = 0;
});

describe("sendHttp in the browser", () => {
  it("reports each piece as it arrives and returns the full response", async () => {
    const body = controllableBody();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(body.stream, { headers: { "content-type": "text/event-stream" } }),
      ),
    );
    const progress: string[] = [];
    const pending = sendHttp(request, { onProgress: (p) => progress.push(p.body) });
    await vi.waitFor(() => expect(progress).toEqual([""]));
    body.push("data: a\n\n");
    await vi.waitFor(() => expect(progress.at(-1)).toBe("data: a\n\n"));
    body.push("data: é\n\n");
    body.close();
    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.body).toBe("data: a\n\ndata: é\n\n");
    expect(response.sizeBytes).toBe(encoder.encode(response.body).length);
    expect(response.timeline?.map((m) => m.end)).toEqual([9, 18]);
    expect(response.incomplete).toBeNull();
  });

  it("keeps what arrived when stopped mid-stream", async () => {
    const body = controllableBody();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        // Like real fetch, aborting errors the body stream.
        init.signal?.addEventListener("abort", body.fail);
        return new Response(body.stream);
      }),
    );
    const controller = new AbortController();
    const pending = sendHttp(request, {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.body) controller.abort();
      },
    });
    body.push("partial");
    const response = await pending;
    expect(response.body).toBe("partial");
    expect(response.incomplete).toBe(STOPPED_MESSAGE);
  });

  it("fails as cancelled when stopped before the reply", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    );
    const pending = sendHttp(request, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow("Request cancelled");
  });

  it("fails as timed out when the server never replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    );
    await expect(sendHttp({ ...request, timeoutMs: 10 })).rejects.toThrow("Request timed out");
  });

  it("refuses a signal that is already aborted", async () => {
    await expect(sendHttp(request, { signal: AbortSignal.abort() })).rejects.toThrow(
      "Request cancelled",
    );
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
