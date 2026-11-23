import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newCollection } from "@narada/core/factories";
import { setAssistClient, type DetectedAgent } from "../../lib/assist/client";
import { useAssistStore } from "../../state/assist-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";

const settingsApi = vi.hoisted(() => ({
  pickFolder: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock("../../lib/settings-api", async (original) => ({
  ...(await original<object>()),
  pickFolder: settingsApi.pickFolder,
}));

const { AgentSettings } = await import("./AgentSettings");

const CLAUDE: DetectedAgent = {
  id: "claude",
  name: "Claude Code",
  path: "/usr/local/bin/claude",
  version: "2.1.330",
};

describe("AgentSettings", () => {
  beforeEach(() => {
    resetStores();
    settingsApi.pickFolder.mockReset();
  });

  it("says agents need the desktop app in the browser build", () => {
    setAssistClient(null);
    render(<AgentSettings />);
    expect(screen.getByText(/only in the desktop app/)).toBeInTheDocument();
  });

  it("lists detected agents and looks again on Refresh", async () => {
    const detect = vi.fn(async () => [] as DetectedAgent[]);
    setAssistClient({ detect, run: vi.fn() });
    render(<AgentSettings />);
    expect(await screen.findByText(/No coding agent found/)).toBeInTheDocument();
    detect.mockResolvedValueOnce([CLAUDE]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Claude Code 2.1.330")).toBeInTheDocument();
    expect(screen.getByText("/usr/local/bin/claude")).toBeInTheDocument();
  });

  it("turns the preview back on", async () => {
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run: vi.fn() });
    useAssistStore.setState({
      settings: { trusted: [], skipPreview: true, defaultFolder: null, collectionFolders: {} },
      settingsLoaded: true,
    });
    render(<AgentSettings />);
    const toggle = await screen.findByLabelText("Show what will be sent before each question");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(useAssistStore.getState().settings.skipPreview).toBe(false));
  });

  it("chooses and clears the default and per-collection project folders", async () => {
    setAssistClient({ detect: vi.fn(async () => [CLAUDE]), run: vi.fn() });
    const shop = newCollection("Shop");
    act(() => useWorkspaceStore.setState({ collections: [shop] }));
    render(<AgentSettings />);

    const defaults = await screen.findByRole("group", { name: "Default project folder" });
    expect(within(defaults).getByText(/None/)).toBeInTheDocument();
    settingsApi.pickFolder.mockResolvedValueOnce("/work");
    fireEvent.click(within(defaults).getByRole("button", { name: "Choose…" }));
    expect(await within(defaults).findByText("/work")).toBeInTheDocument();

    const shopRow = screen.getByRole("group", { name: "Project folder for Shop" });
    expect(within(shopRow).getByText(/Default/)).toBeInTheDocument();
    settingsApi.pickFolder.mockResolvedValueOnce("/work/shop");
    fireEvent.click(within(shopRow).getByRole("button", { name: "Choose…" }));
    expect(await within(shopRow).findByText("/work/shop")).toBeInTheDocument();
    fireEvent.click(within(shopRow).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(useAssistStore.getState().settings.collectionFolders).toEqual({}));

    settingsApi.pickFolder.mockResolvedValueOnce(null); // cancelled
    fireEvent.click(within(defaults).getByRole("button", { name: "Choose…" }));
    await waitFor(() => expect(settingsApi.pickFolder).toHaveBeenCalledTimes(3));
    expect(useAssistStore.getState().settings.defaultFolder).toBe("/work");
  });
});
