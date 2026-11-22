import { Button, Select, TextInput } from "../../components/ui";
import { fieldsFor, type FormField } from "../../lib/mcp/schema-form";
import type { McpOperation, McpRequestDef } from "../../lib/model";
import { useMcpStore, type Connection } from "../../state/mcp-store";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { saveTab } from "../../features/workspace/save-tab";
import { ArgumentsForm } from "./ArgumentsForm";
import { ConnectionDot } from "./ConnectionDot";

interface Props {
  readonly tab: RequestTab;
  readonly request: McpRequestDef;
  readonly onSend: () => void;
}

const EMPTY_OPERATION: Readonly<Record<McpOperation["type"], McpOperation>> = {
  tool: { type: "tool", name: "", arguments: {} },
  resource: { type: "resource", uri: "" },
  prompt: { type: "prompt", name: "", arguments: {} },
};

const NOUN = { tool: "Tool", resource: "Resource URI", prompt: "Prompt" } as const;

/** What the server lists for this kind of operation, to pick from. */
function choices(operation: McpOperation, connection: Connection | undefined): string[] {
  if (!connection) return [];
  switch (operation.type) {
    case "tool":
      return connection.tools.map((t) => t.name);
    case "prompt":
      return connection.prompts.map((p) => p.name);
    case "resource":
      return connection.resources.map((r) => r.uri);
  }
}

function argumentFields(operation: McpOperation, connection: Connection | undefined): FormField[] {
  if (operation.type === "tool") {
    const tool = connection?.tools.find((t) => t.name === operation.name);
    return tool ? fieldsFor(tool.inputSchema) : [];
  }
  if (operation.type === "prompt") {
    const prompt = connection?.prompts.find((p) => p.name === operation.name);
    return (prompt?.arguments ?? []).map((arg) => ({
      name: arg.name,
      label: arg.name,
      description: arg.description ?? null,
      kind: "string",
      required: arg.required ?? false,
      options: [],
    }));
  }
  return [];
}

function describe(operation: McpOperation, connection: Connection | undefined): string | null {
  const name = operation.type === "resource" ? operation.uri : operation.name;
  const found =
    operation.type === "tool"
      ? connection?.tools.find((t) => t.name === name)
      : operation.type === "prompt"
        ? connection?.prompts.find((p) => p.name === name)
        : connection?.resources.find((r) => r.uri === name);
  return found?.description ?? null;
}

/** Server, operation and arguments of an MCP request. */
export function McpComposer({ tab, request, onSend }: Props) {
  const servers = useMcpStore((s) => s.servers);
  const connection = useMcpStore((s) => s.connections[request.serverId]);
  const update = (fn: (r: McpRequestDef) => McpRequestDef) =>
    useTabsStore.getState().updateRequest(tab.id, (r) => (r.protocol === "mcp" ? fn(r) : r));
  const setOperation = (operation: McpOperation) => update((r) => ({ ...r, operation }));
  const { operation } = request;
  const current = operation.type === "resource" ? operation.uri : operation.name;
  const listed = choices(operation, connection);
  // A saved request may name something the server no longer lists; keep it selectable.
  const options =
    current && listed.length > 0 && !listed.includes(current) ? [current, ...listed] : listed;
  const description = describe(operation, connection);

  return (
    <section
      aria-label="Compose request"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_8px_28px_rgb(31_27_46/0.06)]"
    >
      <div className="flex items-center gap-2">
        <TextInput
          aria-label="Request name"
          className="flex-1 border-transparent px-1 font-display text-xl! font-semibold hover:border-line"
          value={request.name}
          onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
        />
        <Button onClick={() => void saveTab(tab)}>Save</Button>
      </div>
      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-1 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <span className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 font-mono text-sm font-semibold text-accent-soft-ink">
          <ConnectionDot status={connection?.status} />
          MCP
        </span>
        <Select
          aria-label="MCP server"
          className="max-w-48 border-transparent"
          value={request.serverId}
          onChange={(e) => update((r) => ({ ...r, serverId: e.target.value }))}
        >
          {!servers.some((s) => s.id === request.serverId) && (
            <option value={request.serverId}>Choose a server…</option>
          )}
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Operation"
          className="border-transparent"
          value={operation.type}
          onChange={(e) => setOperation(EMPTY_OPERATION[e.target.value as McpOperation["type"]])}
        >
          <option value="tool">Call tool</option>
          <option value="resource">Read resource</option>
          <option value="prompt">Get prompt</option>
        </Select>
        {options.length > 0 && operation.type !== "resource" ? (
          <Select
            aria-label={NOUN[operation.type]}
            className="min-w-40 flex-1 border-transparent font-mono"
            value={current}
            onChange={(e) => setOperation({ ...operation, name: e.target.value, arguments: {} })}
          >
            <option value="">Choose…</option>
            {options.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
        ) : (
          <>
            <TextInput
              aria-label={NOUN[operation.type]}
              list={`${tab.id}-choices`}
              className="min-w-40 flex-1 border-transparent font-mono focus:border-transparent"
              placeholder={operation.type === "resource" ? "file:///path or {{variable}}" : "name"}
              value={current}
              onChange={(e) =>
                setOperation(
                  operation.type === "resource"
                    ? { ...operation, uri: e.target.value }
                    : { ...operation, name: e.target.value },
                )
              }
            />
            <datalist id={`${tab.id}-choices`}>
              {options.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </>
        )}
        <Button type="submit" variant="primary" className="px-5 py-2" disabled={tab.loading}>
          {tab.loading ? "Dispatching…" : "Dispatch"}
        </Button>
      </form>
      {servers.length === 0 && (
        <p className="text-sm text-muted">
          No MCP servers yet.{" "}
          <button
            type="button"
            className="font-semibold text-accent-text"
            onClick={() => {
              const server = useMcpStore.getState().create();
              update((r) => ({ ...r, serverId: server.id }));
              useUiStore.getState().show({ kind: "mcp-server", id: server.id });
            }}
          >
            Add one
          </button>
        </p>
      )}
      {connection?.status !== "connected" && servers.length > 0 && (
        <p className="text-xs text-muted">
          Narada connects when you dispatch. Connect from the server page to pick from its tools.
        </p>
      )}
      {description && <p className="text-sm text-muted">{description}</p>}
      {operation.type !== "resource" && current && (
        <div className="border-t border-line-soft pt-3">
          <ArgumentsForm
            key={`${operation.type}:${current}`}
            fields={argumentFields(operation, connection)}
            values={operation.arguments}
            onChange={(args) => setOperation({ ...operation, arguments: args })}
          />
        </div>
      )}
    </section>
  );
}
