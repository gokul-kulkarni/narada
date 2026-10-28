import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { useMcpStore } from "../../state/mcp-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { installFakeMcp } from "../../test/fake-mcp";
import { resetStores } from "../../test/reset-stores";

async function showServer(config: object) {
  const [server] = await useMcpStore.getState().importConfig({ mcpServers: config });
  render(<App />);
  useUiStore.getState().show({ kind: "mcp-server", id: server.id });
  await screen.findByRole("textbox", { name: "Server name" });
  return server;
}

describe("MCP server page", () => {
  beforeEach(() => resetStores());

  it("edits the connection and switches between local and remote", async () => {
    const server = await showServer({ files: { command: "npx", args: ["-y", "fs server"] } });
    expect(screen.getByText("MCP server · Local command")).toBeInTheDocument();
    expect(screen.getByLabelText("Arguments")).toHaveValue('-y "fs server"');
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "Files" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "uvx" } });
    fireEvent.blur(screen.getByLabelText("Arguments"), {
      target: { value: "mcp-files --root /tmp" },
    });
    await waitFor(() =>
      expect(useMcpStore.getState().servers[0]).toMatchObject({
        name: "Files",
        transport: { command: "uvx", args: ["mcp-files", "--root", "/tmp"] },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remote URL" }));
    fireEvent.change(await screen.findByLabelText("Server URL"), {
      target: { value: "https://x.dev/mcp" },
    });
    await waitFor(() =>
      expect(useMcpStore.getState().servers[0].transport).toMatchObject({
        type: "http",
        url: "https://x.dev/mcp",
      }),
    );
    expect(screen.getByText("MCP server · Remote URL")).toBeInTheDocument();
    expect(server.id).toBe(useMcpStore.getState().servers[0].id);
  });

  it("asks before connecting to a local command and can be cancelled", async () => {
    const { client } = installFakeMcp();
    await showServer({ files: { command: "npx", args: ["server"], env: { TOKEN: "x" } } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const dialog = await screen.findByRole("dialog", { name: "Run this command?" });
    expect(dialog).toHaveTextContent("Environment variables: TOKEN");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("shows capabilities and the log, disconnects, and deletes the server", async () => {
    const { client, events } = installFakeMcp();
    await showServer({ calc: { url: "http://localhost:3000/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("tab", { name: "Tools (1)" });

    fireEvent.click(screen.getByRole("tab", { name: "Resources (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Try readme" }));
    expect(useTabsStore.getState().tabs[0].request).toMatchObject({
      protocol: "mcp",
      operation: { type: "resource", uri: "file:///readme" },
    });

    useUiStore.getState().show({ kind: "mcp-server", id: useMcpStore.getState().servers[0].id });
    fireEvent.click(await screen.findByRole("tab", { name: "Prompts (1)" }));
    expect(screen.getByRole("button", { name: "Try greet" })).toBeInTheDocument();
    events.emit?.({ kind: "stderr", line: "hello from stderr" });
    fireEvent.click(await screen.findByRole("tab", { name: "Log (1)" }));
    expect(screen.getByRole("list", { name: "Server log" })).toHaveTextContent("hello from stderr");
    fireEvent.click(screen.getByRole("button", { name: "Clear log" }));
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(client.disconnect).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(useMcpStore.getState().servers).toEqual([]));
  });

  it("starts blank MCP requests from the tab bar and the sidebar", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "New MCP request tab" }));
    const composer = screen.getByRole("region", { name: "Compose request" });
    expect(composer).toHaveTextContent("No MCP servers yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(useMcpStore.getState().servers).toHaveLength(1);
    expect(useUiStore.getState().view.kind).toBe("mcp-server");
  });
});
