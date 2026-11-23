import { afterEach, describe, expect, it, vi } from "vitest";

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

const { getAssistClient, setAssistClient } = await import("./client");

afterEach(() => {
  setAssistClient(undefined);
  tauri.isTauri.mockReturnValue(false);
  tauri.invoke.mockReset();
  tauri.channels.length = 0;
});

describe("getAssistClient", () => {
  it("has no client in the browser build, which cannot start programs", () => {
    expect(getAssistClient()).toBeNull();
  });

  it("prefers a client set by a test", () => {
    tauri.isTauri.mockReturnValue(true);
    const fake = { detect: vi.fn(), run: vi.fn() };
    setAssistClient(fake);
    expect(getAssistClient()).toBe(fake);
    setAssistClient(null);
    expect(getAssistClient()).toBeNull();
  });
});

describe("the desktop client", () => {
  it("detects agents through the shell", async () => {
    tauri.isTauri.mockReturnValue(true);
    tauri.invoke.mockResolvedValue([{ id: "claude" }]);
    expect(await getAssistClient()?.detect()).toEqual([{ id: "claude" }]);
    expect(tauri.invoke).toHaveBeenCalledWith("assist_detect");
  });

  it("runs an agent, forwards its events and cancels it on abort", async () => {
    tauri.isTauri.mockReturnValue(true);
    let finish = () => {};
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === "assist_run") await new Promise<void>((resolve) => (finish = resolve));
    });
    const events: unknown[] = [];
    const controller = new AbortController();
    const running = getAssistClient()?.run(
      "claude",
      "prompt",
      (e) => events.push(e),
      controller.signal,
    );

    tauri.channels[0]?.onmessage({ kind: "text", text: "hi" });
    expect(events).toEqual([{ kind: "text", text: "hi" }]);
    const [, args] = tauri.invoke.mock.calls[0] as [string, { request: unknown; id: string }];
    expect(args.request).toEqual({ agentId: "claude", prompt: "prompt" });

    controller.abort();
    expect(tauri.invoke).toHaveBeenCalledWith("assist_cancel", { id: args.id });
    finish();
    await running;

    controller.abort();
    expect(tauri.invoke.mock.calls.filter(([c]) => c === "assist_cancel")).toHaveLength(1);
  });
});
