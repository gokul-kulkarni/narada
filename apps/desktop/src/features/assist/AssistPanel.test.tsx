import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistStore, type AssistRun } from "../../state/assist-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { AssistPanel } from "./AssistPanel";

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

const show = (overrides: Partial<AssistRun> = {}) =>
  act(() => useAssistStore.setState({ runs: { "tab-1": run(overrides) } }));

describe("AssistPanel", () => {
  beforeEach(() => {
    resetStores();
    vi.unstubAllGlobals();
  });

  it("shows nothing until the tab has an answer", () => {
    const { container } = render(<AssistPanel tabId="tab-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says what the agent is doing while it runs, and can stop it", () => {
    const stop = vi.spyOn(useAssistStore.getState(), "stop");
    render(<AssistPanel tabId="tab-1" />);
    show();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    show({ activity: "Reading src/orders.ts" });
    expect(screen.getByText("Reading src/orders.ts")).toBeInTheDocument();
    show({ text: "Partly" });
    expect(screen.getByText("Writing…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledWith("tab-1");
  });

  it("shows how a run ended", () => {
    render(<AssistPanel tabId="tab-1" />);
    show({ status: "done" });
    expect(screen.getByText("Done")).toBeInTheDocument();
    show({ status: "stopped" });
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    show({ status: "error", error: "Claude Code exited with code 2" });
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Claude Code exited with code 2");
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("copies the answer, and says so when copying is not possible", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<AssistPanel tabId="tab-1" />);
    show({ status: "done", text: "Add qty." });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(useUiStore.getState().notice).toBe("Answer copied."));
    expect(writeText).toHaveBeenCalledWith("Add qty.");

    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(useUiStore.getState().notice).toBe("Could not copy the answer."));
  });
});
