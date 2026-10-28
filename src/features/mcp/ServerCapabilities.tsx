import { useState } from "react";
import { Card } from "../../components/page";
import { Button, TabStrip } from "../../components/ui";
import type { McpOperation } from "../../lib/model";
import { useMcpStore, type Connection, type LogLine } from "../../state/mcp-store";
import { openMcpRequest } from "./open-request";

type View = "tools" | "resources" | "prompts" | "log";

/** Stable, so the store selector does not see a new array on every render. */
const NO_LOG: readonly LogLine[] = [];

interface Entry {
  readonly key: string;
  readonly title: string;
  readonly detail: string | null;
  readonly operation: McpOperation | null;
}

function entries(view: Exclude<View, "log">, connection: Connection): Entry[] {
  switch (view) {
    case "tools":
      return connection.tools.map((tool) => ({
        key: tool.name,
        title: tool.title ?? tool.name,
        detail: tool.description ?? null,
        operation: { type: "tool", name: tool.name, arguments: {} },
      }));
    case "resources":
      return [
        ...connection.resources.map((r) => ({
          key: r.uri,
          title: r.title ?? r.name ?? r.uri,
          detail: [r.uri, r.description].filter(Boolean).join(" · "),
          operation: { type: "resource", uri: r.uri } as const,
        })),
        ...connection.templates.map((t) => ({
          key: t.uriTemplate,
          title: t.title ?? t.name ?? t.uriTemplate,
          detail: `Template ${t.uriTemplate}${t.description ? ` · ${t.description}` : ""}`,
          operation: { type: "resource", uri: t.uriTemplate } as const,
        })),
      ];
    case "prompts":
      return connection.prompts.map((p) => ({
        key: p.name,
        title: p.title ?? p.name,
        detail: p.description ?? null,
        operation: { type: "prompt", name: p.name, arguments: {} },
      }));
  }
}

/** What a connected server offers, each item one click from a request tab; plus its log. */
export function ServerCapabilities({
  serverId,
  connection,
}: {
  serverId: string;
  connection: Connection;
}) {
  const [view, setView] = useState<View>("tools");
  const log = useMcpStore((s) => s.logs[serverId] ?? NO_LOG);
  const tabs: { id: View; label: string }[] = [
    { id: "tools", label: `Tools (${connection.tools.length})` },
    {
      id: "resources",
      label: `Resources (${connection.resources.length + connection.templates.length})`,
    },
    { id: "prompts", label: `Prompts (${connection.prompts.length})` },
    { id: "log", label: `Log (${log.length})` },
  ];
  return (
    <Card label="Server capabilities">
      <TabStrip label="Server capabilities" tabs={tabs} active={view} onChange={setView} />
      {view === "log" ? (
        <div className="flex flex-col gap-2">
          {log.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing logged yet. Server notifications and stderr appear here.
            </p>
          ) : (
            <ol
              aria-label="Server log"
              className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs"
            >
              {log.map((line, index) => (
                <li key={index} className={line.source === "stderr" ? "text-muted" : ""}>
                  {new Date(line.at).toLocaleTimeString()}{" "}
                  {line.source === "stderr" ? "stderr" : "server"} {line.text}
                </li>
              ))}
            </ol>
          )}
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => useMcpStore.getState().clearLog(serverId)}
          >
            Clear log
          </Button>
        </div>
      ) : (
        <CapabilityList serverId={serverId} items={entries(view, connection)} />
      )}
    </Card>
  );
}

function CapabilityList({ serverId, items }: { serverId: string; items: readonly Entry[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">This server offers none.</p>;
  return (
    <ul aria-label="Capabilities" className="divide-y divide-line-soft">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">{item.title}</p>
            {item.detail && <p className="line-clamp-2 text-xs text-muted">{item.detail}</p>}
          </div>
          {item.operation && (
            <Button
              aria-label={`Try ${item.title}`}
              onClick={() => item.operation && openMcpRequest(serverId, item.operation)}
            >
              Try
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
