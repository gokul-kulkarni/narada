import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDocumentStore } from "@narada/core/storage/document-store";
import type { AssistClient, AssistEvent, DetectedAgent } from "../lib/assist/client";
import { setAssistClient } from "../lib/assist/client";
import { resetStores } from "../test/reset-stores";
import { setServices, getServices } from "./services";
import {
  agentFingerprint,
  applyEvent,
  parseSettings,
  useAssistStore,
  type AssistRun,
} from "./assist-store";

const CLAUDE: DetectedAgent = {
  id: "claude",
  name: "Claude Code",
  path: "/usr/local/bin/claude",
  version: "2.1.330",
};

const run = (overrides: Partial<AssistRun> = {}): AssistRun => ({
  id: "run-1",
  tabId: "tab-1",
  agentId: "claude",
  agentName: "Claude Code",
  status: "running",
  text: "",
  activity: null,
  afterActivity: false,
  error: null,
  costUsd: null,
  ...overrides,
});

/** A fake agent that replays `events`, or waits for a stop when `events` is null. */
function fakeClient(events: readonly AssistEvent[] | null, agents = [CLAUDE]): AssistClient {
  return {
    detect: vi.fn(async () => agents),
    run: vi.fn(async (_agentId, _prompt, onEvent, signal) => {
      if (events) {
        events.forEach(onEvent);
        return;
      }
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => {
          onEvent({ kind: "stopped" });
          resolve();
        }),
      );
    }),
  };
}

describe("applyEvent", () => {
  it("appends streamed text and separates text that follows tool activity", () => {
    let current = applyEvent(run(), { kind: "text", text: "The server " });
    current = applyEvent(current, { kind: "text", text: "says no." });
    current = applyEvent(current, { kind: "activity", label: "Reading a.ts" });
    expect(current.activity).toBe("Reading a.ts");
    current = applyEvent(current, { kind: "text", text: "Add qty." });
    expect(current.text).toBe("The server says no.\n\nAdd qty.");
    expect(current.activity).toBeNull();
    current = applyEvent(current, { kind: "activity", label: "Reading b.ts" });
    expect(applyEvent(current, { kind: "text", text: "\n\nMore." }).text).toBe(
      "The server says no.\n\nAdd qty.\n\nMore.",
    );
  });

  it("finishes with done, error or stopped", () => {
    expect(applyEvent(run(), { kind: "done", sessionId: "s", costUsd: 0.01 })).toMatchObject({
      status: "done",
      costUsd: 0.01,
    });
    expect(applyEvent(run(), { kind: "error", message: "boom" })).toMatchObject({
      status: "error",
      error: "boom",
    });
    expect(applyEvent(run(), { kind: "stopped" }).status).toBe("stopped");
    expect(applyEvent(run(), { kind: "started", sessionId: "s" })).toEqual(run());
  });

  it("returns a new run without changing the old one", () => {
    const before = run();
    applyEvent(before, { kind: "text", text: "x" });
    expect(before.text).toBe("");
  });
});

describe("parseSettings", () => {
  it("reads saved settings and falls back for anything unreadable", () => {
    expect(parseSettings('{"trusted":["a"],"skipPreview":true}')).toEqual({
      trusted: ["a"],
      skipPreview: true,
    });
    for (const bad of [null, "not json", '{"trusted":"x"}', "[]"]) {
      expect(parseSettings(bad)).toEqual({ trusted: [], skipPreview: false });
    }
  });
});

describe("useAssistStore", () => {
  beforeEach(() => {
    resetStores();
  });

  it("detects agents once and reports none in the browser build", async () => {
    const client = fakeClient([]);
    setAssistClient(client);
    expect(await useAssistStore.getState().detect()).toEqual([CLAUDE]);
    await useAssistStore.getState().detect();
    expect(client.detect).toHaveBeenCalledTimes(1);

    resetStores();
    setAssistClient(null);
    expect(await useAssistStore.getState().detect()).toEqual([]);
    expect(useAssistStore.getState().agentsStatus).toBe("ready");
  });

  it("treats a failed detection as no agents", async () => {
    setAssistClient({
      ...fakeClient([]),
      detect: vi.fn(async () => Promise.reject(new Error("x"))),
    });
    expect(await useAssistStore.getState().detect()).toEqual([]);
  });

  it("remembers a confirmed agent and the preview choice on this computer", async () => {
    const documents = createMemoryDocumentStore();
    setServices({ ...getServices(), documents });
    await useAssistStore.getState().confirm(CLAUDE, true);
    expect(parseSettings(await documents.readLocal("assist.json"))).toEqual({
      trusted: [agentFingerprint(CLAUDE)],
      skipPreview: true,
    });
    useAssistStore.setState({ settingsLoaded: false });
    expect(await useAssistStore.getState().loadSettings()).toEqual({
      trusted: [agentFingerprint(CLAUDE)],
      skipPreview: true,
    });
  });

  it("streams a run into the tab's answer", async () => {
    const client = fakeClient([
      { kind: "started", sessionId: "s" },
      { kind: "text", text: "Add qty." },
      { kind: "done", sessionId: "s", costUsd: 0.02 },
    ]);
    setAssistClient(client);
    await useAssistStore.getState().start("tab-1", CLAUDE, "prompt text");
    expect(client.run).toHaveBeenCalledWith(
      "claude",
      "prompt text",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(useAssistStore.getState().runs["tab-1"]).toMatchObject({
      status: "done",
      text: "Add qty.",
      costUsd: 0.02,
      agentName: "Claude Code",
    });
  });

  it("marks a run done if the agent ends without saying so, and failed if it cannot start", async () => {
    setAssistClient(fakeClient([{ kind: "text", text: "hi" }]));
    await useAssistStore.getState().start("tab-1", CLAUDE, "p");
    expect(useAssistStore.getState().runs["tab-1"]?.status).toBe("done");

    setAssistClient({
      ...fakeClient([]),
      run: vi.fn(async () => Promise.reject("Claude Code is not installed")),
    });
    await useAssistStore.getState().start("tab-1", CLAUDE, "p");
    expect(useAssistStore.getState().runs["tab-1"]).toMatchObject({
      status: "error",
      error: "Claude Code is not installed",
    });
  });

  it("stops a run, and dismissing removes it", async () => {
    setAssistClient(fakeClient(null));
    const running = useAssistStore.getState().start("tab-1", CLAUDE, "p");
    expect(useAssistStore.getState().runs["tab-1"]?.status).toBe("running");
    useAssistStore.getState().stop("tab-1");
    await running;
    expect(useAssistStore.getState().runs["tab-1"]?.status).toBe("stopped");
    useAssistStore.getState().dismiss("tab-1");
    expect(useAssistStore.getState().runs["tab-1"]).toBeUndefined();
  });

  it("ignores events from a run that was replaced", async () => {
    let late: ((event: AssistEvent) => void) | undefined;
    setAssistClient({
      detect: vi.fn(async () => [CLAUDE]),
      run: vi.fn(async (_a, _p, onEvent) => {
        late ??= onEvent;
      }),
    });
    await useAssistStore.getState().start("tab-1", CLAUDE, "first");
    await useAssistStore.getState().start("tab-1", CLAUDE, "second");
    late?.({ kind: "text", text: "stale" });
    expect(useAssistStore.getState().runs["tab-1"]?.text).toBe("");
  });
});
