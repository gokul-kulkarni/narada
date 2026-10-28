import type { Connection } from "../../state/mcp-store";

const TONE = {
  connected: "bg-ok",
  connecting: "bg-warn animate-pulse",
  failed: "bg-err",
} as const;

const LABEL = {
  connected: "Connected",
  connecting: "Connecting",
  failed: "Connection failed",
} as const;

/** A small status light for an MCP server connection. */
export function ConnectionDot({ status }: { status: Connection["status"] | undefined }) {
  return (
    <span
      role="img"
      aria-label={status ? LABEL[status] : "Not connected"}
      className={`inline-block size-2 shrink-0 rounded-full ${status ? TONE[status] : "bg-line"}`}
    />
  );
}
