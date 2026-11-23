import { beforeEach, describe, expect, it, vi } from "vitest";
import { newRequest } from "@narada/core/factories";
import { setAssistClient, type AssistClient, type DetectedAgent } from "../../lib/assist/client";
import { agentFingerprint, useAssistStore } from "../../state/assist-store";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { askAgent, askFollowUp } from "./ask";

const CLAUDE: DetectedAgent = { id: "claude", name: "Claude Code", path: "/c", version: "1" };

function openTab(sent: boolean): string {
  const id = useTabsStore.getState().openRequest(newRequest({ url: "https://x.dev" }), null);
  if (sent) useTabsStore.getState().patchTab(id, { error: "ECONNREFUSED" });
  return id;
}

describe("askAgent", () => {
  beforeEach(() => {
    resetStores();
  });

  it("asks the user to send the request first", async () => {
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run: vi.fn() });
    await askAgent(openTab(false));
    expect(useUiStore.getState().notice).toBe(
      "Send the request first, then ask about its response.",
    );
    expect(useUiStore.getState().dialog).toBeNull();
  });

  it("explains when no agent is installed", async () => {
    setAssistClient({ detect: vi.fn(async () => []), run: vi.fn() });
    await askAgent(openTab(true));
    expect(useUiStore.getState().notice).toMatch(/No coding agent found/);
  });

  it("previews before the first run, then runs straight away once confirmed", async () => {
    const run = vi.fn(async () => {});
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run });
    const tabId = openTab(true);
    await askAgent(tabId);
    expect(useUiStore.getState().dialog).toEqual({
      kind: "assist-preview",
      tabId,
      agentId: "claude",
    });

    useUiStore.getState().closeDialog();
    useAssistStore.setState({
      settings: {
        trusted: [agentFingerprint(CLAUDE)],
        skipPreview: true,
        defaultFolder: null,
        collectionFolders: {},
      },
      settingsLoaded: true,
    });
    await askAgent(tabId);
    expect(useUiStore.getState().dialog).toBeNull();
    expect(run).toHaveBeenCalledWith(
      {
        agentId: "claude",
        prompt: expect.stringContaining("ECONNREFUSED"),
        sessionId: null,
        cwd: null,
      },
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("previews again when the agent's path or version changed", async () => {
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run: vi.fn() });
    useAssistStore.setState({
      settings: {
        trusted: ["/c@0"],
        skipPreview: true,
        defaultFolder: null,
        collectionFolders: {},
      },
      settingsLoaded: true,
    });
    await askAgent(openTab(true));
    expect(useUiStore.getState().dialog?.kind).toBe("assist-preview");
  });

  it("removes known secret values from a follow-up question", async () => {
    const followUp = vi.spyOn(useAssistStore.getState(), "followUp").mockResolvedValue();
    useWorkspaceStore.setState({
      environments: [
        {
          id: "env",
          name: "dev",
          variables: [
            { id: "v", key: "token", value: "sk-live-abcdef", enabled: true, secret: true },
          ],
        },
      ],
      activeEnvironmentId: "env",
    });
    const tabId = openTab(true);
    await askFollowUp(tabId, "  why is sk-live-abcdef rejected?  ");
    expect(followUp).toHaveBeenCalledWith(tabId, "why is [secret:token] rejected?");
    await askFollowUp(tabId, "   ");
    expect(followUp).toHaveBeenCalledTimes(1);
  });

  it("runs in the collection's project folder, else the default one", async () => {
    const run = vi.fn<AssistClient["run"]>(async () => {});
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run });
    useAssistStore.setState({
      settings: {
        trusted: [agentFingerprint(CLAUDE)],
        skipPreview: true,
        defaultFolder: "/work",
        collectionFolders: { shop: "/work/shop" },
      },
      settingsLoaded: true,
    });
    const saved = useTabsStore.getState().openRequest(newRequest({ url: "https://x.dev/a" }), {
      collectionId: "shop",
      requestId: "r1",
    });
    useTabsStore.getState().patchTab(saved, { error: "ECONNREFUSED" });
    await askAgent(saved);
    await askAgent(openTab(true));
    expect(run.mock.calls.map(([request]) => request.cwd)).toEqual(["/work/shop", "/work"]);
  });
});
