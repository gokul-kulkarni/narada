import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { newKeyValue, newRequest } from "@narada/core/factories";
import type { RequestDef } from "@narada/core/model";
import { useAssistStore, type AssistRun } from "../../state/assist-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { AssistPanel } from "./AssistPanel";

const PATCH = [
  "The server wants JSON with `qty`.",
  "",
  "```narada-patch",
  JSON.stringify({
    method: "POST",
    headers: [{ key: "Content-Type", value: "application/json" }],
    body: { mode: "raw", language: "json", raw: '{"qty":1}' },
  }),
  "```",
].join("\n");

function setUp(request: RequestDef, text: string, status: AssistRun["status"] = "done") {
  const tabId = useTabsStore.getState().openRequest(request, null);
  const run: AssistRun = {
    id: "run-1",
    tabId,
    agentId: "claude",
    agentName: "Claude Code",
    status,
    text,
    activity: null,
    afterActivity: false,
    error: null,
    costUsd: null,
    sessionId: "s",
    question: null,
    earlier: [],
    cwd: null,
  };
  act(() => useAssistStore.setState({ runs: { [tabId]: run } }));
  render(<AssistPanel tabId={tabId} />);
  return tabId;
}

const http = () =>
  newRequest({
    method: "GET",
    url: "https://shop.dev/orders",
    headers: [newKeyValue("Accept", "*/*")],
  });

describe("a suggested change in the agent's answer", () => {
  beforeEach(() => {
    resetStores();
  });

  it("shows the change instead of the raw block, and applies it to the tab", () => {
    const tabId = setUp(http(), PATCH);
    expect(screen.queryByText(/narada-patch/)).toBeNull();
    const card = screen.getByRole("region", { name: "Suggested change" });
    expect(within(card).getByText("Method")).toBeInTheDocument();
    expect(within(card).getByText("POST")).toBeInTheDocument();
    expect(within(card).getByText("Header Content-Type")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Apply to tab" }));
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    expect(tab?.dirty).toBe(true);
    expect(tab?.request).toMatchObject({
      method: "POST",
      body: { mode: "raw", language: "json", raw: '{"qty":1}' },
    });
    expect(useUiStore.getState().notice).toMatch(/Dispatch to try it/);
    expect(within(card).getByText(/already in the request/)).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Apply to tab" })).toBeNull();
  });

  it("waits until the answer is finished", () => {
    setUp(http(), PATCH, "running");
    expect(screen.queryByRole("region", { name: "Suggested change" })).toBeNull();
  });

  it("explains a change that couldn't be read", () => {
    setUp(http(), "Try this:\n\n```narada-patch\n{ nope\n```");
    const card = screen.getByRole("region", { name: "Suggested change" });
    expect(within(card).getByText(/couldn't be read/)).toBeInTheDocument();
    expect(within(card).queryByRole("button")).toBeNull();
  });

  it("offers nothing for an MCP request", () => {
    setUp(
      {
        protocol: "mcp",
        id: "m",
        name: "call",
        serverId: "s",
        operation: { type: "resource", uri: "u" },
      },
      PATCH,
    );
    expect(screen.queryByRole("region", { name: "Suggested change" })).toBeNull();
  });
});
