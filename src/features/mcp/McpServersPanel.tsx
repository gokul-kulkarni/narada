import { Button, EmptyState, SectionHeading } from "../../components/ui";
import { useMcpStore } from "../../state/mcp-store";
import { useUiStore } from "../../state/ui-store";
import { ConnectionDot } from "../../protocols/mcp/ConnectionDot";

const ROW = "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-2";

/** Sidebar list of saved MCP servers with their connection state. */
export function McpServersPanel() {
  const servers = useMcpStore((s) => s.servers);
  const connections = useMcpStore((s) => s.connections);
  const view = useUiStore((s) => s.view);
  const { show } = useUiStore.getState();
  return (
    <section aria-label="MCP servers">
      <div className="mb-1 flex items-center justify-between">
        <SectionHeading>MCP servers</SectionHeading>
        <Button
          variant="ghost"
          className="px-2 py-0.5"
          onClick={() => show({ kind: "mcp-server", id: useMcpStore.getState().create().id })}
        >
          + New
        </Button>
      </div>
      <ul className="text-sm">
        {servers.map((server) => (
          <li key={server.id}>
            <button
              type="button"
              className={`${ROW} ${view.kind === "mcp-server" && view.id === server.id ? "bg-accent-soft font-semibold text-accent-soft-ink" : ""}`}
              onClick={() => show({ kind: "mcp-server", id: server.id })}
            >
              <ConnectionDot status={connections[server.id]?.status} />
              <span className="truncate">{server.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {servers.length === 0 && (
        <EmptyState>
          No MCP servers yet. Add one, or paste an mcpServers config into Import.
        </EmptyState>
      )}
    </section>
  );
}
