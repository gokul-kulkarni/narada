import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { McpOperation } from "../../lib/model";
import { useHistoryStore } from "../../state/history-store";
import { useMcpStore } from "../../state/mcp-store";
import { useTabsStore } from "../../state/tabs-store";
import { installFakeMcp } from "../../test/fake-mcp";
import { resetStores } from "../../test/reset-stores";

async function addServer(config: object) {
  const [server] = await useMcpStore.getState().importConfig({ mcpServers: config });
  return server;
}

async function openServerPage(name: string) {
  render(<App />);
  const sidebar = await screen.findByRole("region", { name: "MCP servers" });
  fireEvent.click(within(sidebar).getByRole("button", { name: new RegExp(name) }));
}

describe("MCP inspector", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("connects, tries a tool and shows its result in the delivery log", async () => {
    installFakeMcp();
    await addServer({ calc: { url: "http://localhost:3000/mcp" } });
    await openServerPage("calc");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("calculator 1.0.0")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tools (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try add" }));
    expect(screen.getByRole("combobox", { name: "Tool" })).toHaveValue("add");
    expect(screen.getByText("Add two numbers")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("a"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("b"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));

    const latest = await screen.findByRole("article", { name: "Latest delivery" });
    expect(within(latest).getByTestId("response-status")).toHaveTextContent(
      "Delivered · Tool · 7 ms",
    );
    expect(latest).toHaveTextContent("MCP calc › add");
    expect(within(latest).getByRole("list", { name: "Result content" })).toHaveTextContent("5");
    fireEvent.click(within(latest).getByRole("tab", { name: "Raw" }));
    expect(within(latest).getByLabelText("Raw reply")).toHaveTextContent('"text": "5"');
    expect(useHistoryStore.getState().entries[0]).toMatchObject({ timeMs: 7, isError: false });
  });

  it("checks arguments against the tool's schema before sending", async () => {
    const { client } = installFakeMcp();
    await addServer({ calc: { url: "http://localhost:3000/mcp" } });
    await openServerPage("calc");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try add" }));
    fireEvent.change(screen.getByLabelText("a"), { target: { value: "two" } });
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check the arguments: a: Enter a number; b: Required",
    );
    expect(client.run).not.toHaveBeenCalled();
  });

  it("asks before a local command first runs, then connects on dispatch", async () => {
    const { client } = installFakeMcp();
    const server = await addServer({ local: { command: "npx", args: ["-y", "calc-server"] } });
    render(<App />);
    useTabsStore.getState().openRequest(
      {
        protocol: "mcp",
        id: "r1",
        name: "Add",
        serverId: server.id,
        operation: { type: "tool", name: "add", arguments: { a: 1, b: 1 } },
      },
      null,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));
    const dialog = await screen.findByRole("dialog", { name: "Run this command?" });
    expect(within(dialog).getByLabelText("Command to run")).toHaveTextContent("npx -y calc-server");
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirm the server's command");
    fireEvent.click(within(dialog).getByRole("button", { name: "Run server" }));
    await waitFor(() => expect(client.connect).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    expect(await screen.findByRole("article", { name: "Latest delivery" })).toHaveTextContent("2");
  });

  it("reads resources, gets prompts and flags tool errors", async () => {
    installFakeMcp({
      run: async (_id, operation) =>
        operation.type === "tool"
          ? { result: { content: [{ type: "text", text: "boom" }], isError: true }, timeMs: 1 }
          : operation.type === "resource"
            ? { result: { contents: [{ uri: "file:///readme", text: '{"a":1}' }] }, timeMs: 1 }
            : {
                result: {
                  description: "Greets",
                  messages: [{ role: "user", content: { type: "text", text: "Hi Ada" } }],
                },
                timeMs: 1,
              },
    });
    const server = await addServer({ calc: { url: "http://localhost:3000/mcp" } });
    render(<App />);
    let count = 0;
    const open = (operation: McpOperation) => {
      count += 1;
      useTabsStore
        .getState()
        .openRequest(
          { protocol: "mcp", id: `r${count}`, name: "x", serverId: server.id, operation },
          null,
        );
    };

    open({ type: "resource", uri: "file:///readme" });
    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));
    expect(await screen.findByText(/"a": 1/)).toBeInTheDocument();

    open({ type: "prompt", name: "greet", arguments: { who: "Ada" } });
    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));
    expect(await screen.findByRole("list", { name: "Prompt messages" })).toHaveTextContent(
      "userHi Ada",
    );

    open({ type: "tool", name: "explode", arguments: {} });
    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));
    await waitFor(() =>
      expect(screen.getByTestId("response-status")).toHaveTextContent(
        "Returned · Tool reported an error",
      ),
    );
    expect(useHistoryStore.getState().entries[0].isError).toBe(true);
  });
});
