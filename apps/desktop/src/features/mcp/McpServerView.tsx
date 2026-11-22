import { Card, Page, TITLE_INPUT } from "../../components/page";
import { Button, TextInput } from "../../components/ui";
import { describeTransport } from "../../lib/mcp/server";
import { useMcpStore } from "../../state/mcp-store";
import { useUiStore } from "../../state/ui-store";
import { StatusPill } from "../delivery/StatusPill";
import { ConnectionSettings } from "./ConnectionSettings";
import { connectionScopes, openMcpRequest } from "./open-request";
import { ServerCapabilities } from "./ServerCapabilities";

/** Connect to the server; a local command not yet confirmed on this computer asks first. */
export async function connectServer(serverId: string): Promise<void> {
  const outcome = await useMcpStore.getState().connect(serverId, connectionScopes());
  if (outcome === "needs-trust") useUiStore.getState().openDialog({ kind: "mcp-trust", serverId });
}

export function McpServerView({ id }: { id: string }) {
  const server = useMcpStore((s) => s.servers.find((x) => x.id === id));
  const connection = useMcpStore((s) => s.connections[id]);
  if (!server) return <p className="p-8 text-muted">This MCP server no longer exists.</p>;

  const mcp = useMcpStore.getState();
  const connected = connection?.status === "connected";
  const info = connection?.info;
  const actions = (
    <>
      {connected ? (
        <Button key="disconnect" onClick={() => void mcp.disconnect(id)}>
          Disconnect
        </Button>
      ) : (
        <Button
          key="connect"
          variant="primary"
          disabled={connection?.status === "connecting"}
          onClick={() => void connectServer(id)}
        >
          {connection?.status === "connecting" ? "Connecting…" : "Connect"}
        </Button>
      )}
      <Button onClick={() => openMcpRequest(id, { type: "tool", name: "", arguments: {} })}>
        New request
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          useUiStore.getState().show({ kind: "requests" });
          void mcp.remove(id);
        }}
      >
        Delete
      </Button>
    </>
  );

  return (
    <Page
      eyebrow={`MCP server · ${server.transport.type === "stdio" ? "Local command" : "Remote URL"}`}
      title={
        <TextInput
          aria-label="Server name"
          className={TITLE_INPUT}
          value={server.name}
          onChange={(e) => void mcp.update(id, (s) => ({ ...s, name: e.target.value }))}
        />
      }
      actions={actions}
    >
      {connection && (
        <Card label="Status">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill
              tone={connected ? "ok" : connection.status === "failed" ? "err" : "pending"}
            >
              {connected
                ? "Connected"
                : connection.status === "failed"
                  ? "Not connected"
                  : "Connecting…"}
            </StatusPill>
            {info?.serverInfo?.name && (
              <span className="font-mono">
                {info.serverInfo.name} {info.serverInfo.version}
              </span>
            )}
            {info?.protocolVersion && (
              <span className="text-muted">MCP {info.protocolVersion}</span>
            )}
            <span className="truncate font-mono text-xs text-muted">
              {describeTransport(server.transport)}
            </span>
          </div>
          {connection.error && (
            <p role="alert" className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
              {connection.error}
            </p>
          )}
          {info?.instructions && (
            <p className="text-sm whitespace-pre-wrap text-muted">{info.instructions}</p>
          )}
        </Card>
      )}
      {connected && <ServerCapabilities serverId={id} connection={connection} />}
      <ConnectionSettings
        key={id}
        server={server}
        onChange={(transport) => void mcp.update(id, (s) => ({ ...s, transport }))}
      />
    </Page>
  );
}
