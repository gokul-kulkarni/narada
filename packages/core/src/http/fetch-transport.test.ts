import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreparedRequest } from "../prepare-request";
import { STOPPED_MESSAGE } from "../stream/stream-state";
import { sendWithFetch } from "./fetch-transport";

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
});

describe("sendWithFetch", () => {
  it("reports each piece as it arrives and returns the full response", async () => {
    const body = controllableBody();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(body.stream, { headers: { "content-type": "text/event-stream" } }),
      ),
    );
    const progress: string[] = [];
    const pending = sendWithFetch(request, { onProgress: (p) => progress.push(p.body) });
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
    const pending = sendWithFetch(request, {
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
    const pending = sendWithFetch(request, { signal: controller.signal });
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
    await expect(sendWithFetch({ ...request, timeoutMs: 10 })).rejects.toThrow("Request timed out");
  });

  it("refuses a signal that is already aborted", async () => {
    await expect(sendWithFetch(request, { signal: AbortSignal.abort() })).rejects.toThrow(
      "Request cancelled",
    );
  });
});
