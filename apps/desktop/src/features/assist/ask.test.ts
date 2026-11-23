import { beforeEach, describe, expect, it, vi } from "vitest";
import { newRequest } from "@narada/core/factories";
import { setAssistClient, type DetectedAgent } from "../../lib/assist/client";
import { agentFingerprint, useAssistStore } from "../../state/assist-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { askAgent } from "./ask";

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
      settings: { trusted: [agentFingerprint(CLAUDE)], skipPreview: true },
      settingsLoaded: true,
    });
    await askAgent(tabId);
    expect(useUiStore.getState().dialog).toBeNull();
    expect(run).toHaveBeenCalledWith(
      "claude",
      expect.stringContaining("ECONNREFUSED"),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("previews again when the agent's path or version changed", async () => {
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run: vi.fn() });
    useAssistStore.setState({
      settings: { trusted: ["/c@0"], skipPreview: true },
      settingsLoaded: true,
    });
    await askAgent(openTab(true));
    expect(useUiStore.getState().dialog?.kind).toBe("assist-preview");
  });
});
