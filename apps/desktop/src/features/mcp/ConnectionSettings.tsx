import { Card } from "../../components/page";
import { TextInput, join } from "../../components/ui";
import {
  emptyTransport,
  joinArgs,
  splitArgs,
  type McpServer,
  type McpTransport,
} from "../../lib/mcp/server";
import { KeyValueEditor } from "../request/KeyValueEditor";

const LABEL = "flex flex-col gap-1 text-sm font-semibold";
const SEGMENT = "rounded-md px-3 py-1 text-sm transition-colors";

interface Props {
  readonly server: McpServer;
  readonly onChange: (transport: McpTransport) => void;
}

/** How Narada reaches the server: a local command or a URL. */
export function ConnectionSettings({ server, onChange }: Props) {
  const { transport } = server;
  const kinds = [
    { type: "stdio", label: "Local command" },
    { type: "http", label: "Remote URL" },
  ] as const;
  return (
    <Card
      label="Connection"
      title="Connection"
      description="Values can use {{variables}}; keep tokens in an environment's secret variables."
    >
      <div
        role="group"
        aria-label="Transport"
        className="flex w-fit gap-0.5 rounded-lg bg-surface-2 p-0.5"
      >
        {kinds.map((kind) => (
          <button
            key={kind.type}
            type="button"
            aria-pressed={transport.type === kind.type}
            onClick={() => transport.type !== kind.type && onChange(emptyTransport(kind.type))}
            className={join(
              SEGMENT,
              transport.type === kind.type
                ? "bg-surface font-bold shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {kind.label}
          </button>
        ))}
      </div>
      {transport.type === "stdio" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <label className={LABEL}>
              Command
              <TextInput
                aria-label="Command"
                className="font-mono"
                placeholder="npx"
                value={transport.command}
                onChange={(e) => onChange({ ...transport, command: e.target.value })}
              />
            </label>
            <label className={LABEL}>
              Arguments
              <TextInput
                aria-label="Arguments"
                className="font-mono"
                placeholder="-y @modelcontextprotocol/server-everything"
                defaultValue={joinArgs(transport.args)}
                onBlur={(e) => onChange({ ...transport, args: splitArgs(e.target.value) })}
              />
            </label>
          </div>
          <label className={LABEL}>
            Working folder <span className="font-normal text-muted">(optional)</span>
            <TextInput
              aria-label="Working folder"
              className="font-mono"
              value={transport.cwd}
              onChange={(e) => onChange({ ...transport, cwd: e.target.value })}
            />
          </label>
          <KeyValueEditor
            label="Environment variables"
            rows={transport.env}
            onChange={(env) => onChange({ ...transport, env })}
          />
        </>
      ) : (
        <>
          <label className={LABEL}>
            URL
            <TextInput
              aria-label="Server URL"
              className="font-mono"
              placeholder="https://example.com/mcp"
              value={transport.url}
              onChange={(e) => onChange({ ...transport, url: e.target.value })}
            />
          </label>
          <KeyValueEditor
            label="Headers"
            rows={transport.headers}
            onChange={(headers) => onChange({ ...transport, headers })}
          />
        </>
      )}
    </Card>
  );
}
