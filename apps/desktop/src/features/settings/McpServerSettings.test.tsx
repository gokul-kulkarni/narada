import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNaradaMcpClient, type NaradaMcpClient } from "../../lib/narada-mcp/client";
import { useMcpActivityStore } from "../../state/mcp-activity-store";
import { useMcpServerStore } from "../../state/mcp-server-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { McpServerSettings } from "./McpServerSettings";

function install(start: NaradaMcpClient["start"] = async (port) => port) {
  const client: NaradaMcpClient = {
    start: vi.fn(start),
    stop: vi.fn(async () => {}),
    reply: vi.fn(),
    onToolCall: vi.fn(async () => () => {}),
    onToolCancelled: vi.fn(async () => () => {}),
  };
  setNaradaMcpClient(client);
  return client;
}

describe("McpServerSettings", () => {
  beforeEach(() => {
    resetStores();
    vi.unstubAllGlobals();
  });

  it("says it needs the desktop app in the browser build", () => {
    setNaradaMcpClient(null);
    render(<McpServerSettings />);
    expect(screen.getByText(/only in the desktop app/)).toBeInTheDocument();
  });

  it("turns on, shows where it listens and how to connect each agent, and copies with the real token", async () => {
    install();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<McpServerSettings />);
    fireEvent.click(await screen.findByLabelText("Let coding agents connect to Narada"));
    expect(await screen.findByText("http://127.0.0.1:7377/mcp")).toBeInTheDocument();

    const token = useMcpServerStore.getState().token ?? "";
    expect(screen.queryByText(new RegExp(token))).toBeNull(); // masked on screen
    const claude = screen.getByRole("group", { name: "Claude Code" });
    fireEvent.click(within(claude).getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`Bearer ${token}`)),
    );
    expect(useUiStore.getState().notice).toBe("Copied. It includes your token; keep it private.");
    expect(screen.getByRole("group", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Cursor and others" })).toBeInTheDocument();
  });

  it("changes the port and regenerates the token", async () => {
    const client = install();
    render(<McpServerSettings />);
    fireEvent.click(await screen.findByLabelText("Let coding agents connect to Narada"));
    await screen.findByText("http://127.0.0.1:7377/mcp");

    const port = screen.getByLabelText("Port");
    fireEvent.change(port, { target: { value: "8200" } });
    fireEvent.blur(port);
    expect(await screen.findByText("http://127.0.0.1:8200/mcp")).toBeInTheDocument();

    const before = useMcpServerStore.getState().token;
    fireEvent.click(screen.getByRole("button", { name: "New token" }));
    await waitFor(() => expect(useMcpServerStore.getState().token).not.toBe(before));
    expect(client.start).toHaveBeenCalledTimes(3);
  });

  it("shows why it could not start", async () => {
    install(async () =>
      Promise.reject("Port 7377 is already in use. Choose another port in Settings."),
    );
    render(<McpServerSettings />);
    fireEvent.click(await screen.findByLabelText("Let coding agents connect to Narada"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Port 7377 is already in use");
  });

  it("lists what connected agents asked for", async () => {
    install();
    useMcpActivityStore.getState().record({
      callId: "c1",
      at: "2026-11-23T10:00:00.000Z",
      client: "Claude Code",
      tool: "create_request",
      outcome: "error",
      detail: "The user declined, so nothing was added.",
    });
    useMcpActivityStore.getState().record({
      callId: "c2",
      at: "2026-11-23T10:01:00.000Z",
      client: null,
      tool: "list_collections",
      outcome: "ok",
      detail: null,
    });
    render(<McpServerSettings />);
    const list = await screen.findByRole("list", { name: "Recent MCP activity" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("An agent");
    expect(items[0]).toHaveTextContent("list_collections");
    expect(items[0]).toHaveTextContent("answered");
    expect(items[1]).toHaveTextContent("Claude Code");
    expect(items[1]).toHaveTextContent("The user declined");
  });
});
