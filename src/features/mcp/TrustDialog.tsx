import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import { useMcpStore } from "../../state/mcp-store";
import { connectionScopes } from "./open-request";

/** Shows exactly what will run before a local MCP server first starts on this computer. */
export function TrustDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const server = useMcpStore((s) => s.servers.find((x) => x.id === serverId));
  if (server?.transport.type !== "stdio") return null;
  const { command, args, env, cwd } = server.transport;
  const envNames = env.filter((e) => e.enabled && e.key.trim()).map((e) => e.key);
  return (
    <Modal title="Run this command?" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p>
          <b>{server.name}</b> starts a program on this computer with your permissions. Only run
          commands you recognise, especially ones that arrived through sync or import.
        </p>
        <pre
          aria-label="Command to run"
          className="overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] whitespace-pre-wrap break-all"
        >
          {[command, ...args].join(" ")}
        </pre>
        {envNames.length > 0 && (
          <p className="text-muted">Environment variables: {envNames.join(", ")}</p>
        )}
        {cwd && <p className="text-muted">Working folder: {cwd}</p>}
        <p className="text-muted">Narada asks again if the command or its arguments change.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              void useMcpStore.getState().trustAndConnect(serverId, connectionScopes());
            }}
          >
            Run server
          </Button>
        </div>
      </div>
    </Modal>
  );
}
