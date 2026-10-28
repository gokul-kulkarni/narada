import { create } from "zustand";
import { errorMessage } from "../lib/format";
import { getMcpClient, type ClientEvent, type ListKind, type ServerInfo } from "../lib/mcp/client";
import {
  parsePrompts,
  parseResources,
  parseTemplates,
  parseTools,
  type McpPrompt,
  type McpResource,
  type McpResourceTemplate,
  type McpTool,
} from "../lib/mcp/results";
import {
  newMcpServer,
  resolveTransport,
  serversFromConfig,
  type McpServer,
  type ResolvedTransport,
} from "../lib/mcp/server";
import { fingerprint, needsTrust, parseTrusted } from "../lib/mcp/trust";
import * as repo from "../lib/storage/mcp-repository";
import type { LoadError } from "../lib/storage/workspace-repository";
import type { VariableScopes } from "../lib/variables";
import { getServices } from "./services";

export const LOG_LIMIT = 500;

export interface LogLine {
  readonly at: string;
  readonly source: "server" | "stderr";
  readonly text: string;
}

export interface Connection {
  readonly status: "connecting" | "connected" | "failed";
  readonly info: ServerInfo | null;
  readonly error: string | null;
  readonly tools: readonly McpTool[];
  readonly resources: readonly McpResource[];
  readonly templates: readonly McpResourceTemplate[];
  readonly prompts: readonly McpPrompt[];
}

export type ConnectOutcome = "connected" | "needs-trust" | "failed";

interface McpState {
  readonly servers: readonly McpServer[];
  readonly connections: Readonly<Record<string, Connection>>;
  readonly logs: Readonly<Record<string, readonly LogLine[]>>;
  readonly trusted: readonly string[];
  readonly loadErrors: readonly LoadError[];

  load: () => Promise<void>;
  create: (name?: string) => McpServer;
  update: (id: string, update: (server: McpServer) => McpServer) => Promise<void>;
  remove: (id: string) => Promise<void>;
  importConfig: (json: unknown) => Promise<readonly McpServer[]>;
  /** Connects unless a local command first needs the user's confirmation. */
  connect: (id: string, scopes: VariableScopes) => Promise<ConnectOutcome>;
  trustAndConnect: (id: string, scopes: VariableScopes) => Promise<ConnectOutcome>;
  disconnect: (id: string) => Promise<void>;
  refresh: (id: string, kind: ListKind) => Promise<void>;
  clearLog: (id: string) => void;
}

const EMPTY_CONNECTION: Connection = {
  status: "connecting",
  info: null,
  error: null,
  tools: [],
  resources: [],
  templates: [],
  prompts: [],
};

const LIST_FIELD = {
  tools: ["tools", parseTools],
  resources: ["resources", parseResources],
  resourceTemplates: ["templates", parseTemplates],
  prompts: ["prompts", parsePrompts],
} as const;

/** Which lists a server offers, from its capabilities. */
function listsFor(info: ServerInfo): ListKind[] {
  const caps = info.capabilities ?? {};
  return [
    ...(caps.tools ? (["tools"] as const) : []),
    ...(caps.resources ? (["resources", "resourceTemplates"] as const) : []),
    ...(caps.prompts ? (["prompts"] as const) : []),
  ];
}

const LIST_CHANGED: Readonly<Record<string, ListKind>> = {
  "notifications/tools/list_changed": "tools",
  "notifications/resources/list_changed": "resources",
  "notifications/prompts/list_changed": "prompts",
};

function describeEvent(event: ClientEvent): LogLine {
  const at = new Date().toISOString();
  if (event.kind === "stderr") return { at, source: "stderr", text: event.line };
  const params =
    event.params === null || event.params === undefined ? "" : ` ${JSON.stringify(event.params)}`;
  return { at, source: "server", text: `${event.method}${params}` };
}

export const useMcpStore = create<McpState>()((set, get) => {
  const patchConnection = (id: string, patch: Partial<Connection>) =>
    set((s) => ({
      connections: {
        ...s.connections,
        [id]: { ...(s.connections[id] ?? EMPTY_CONNECTION), ...patch },
      },
    }));

  const log = (id: string, line: LogLine) =>
    set((s) => ({ logs: { ...s.logs, [id]: [...(s.logs[id] ?? []), line].slice(-LOG_LIMIT) } }));

  const onEvent = (id: string) => (event: ClientEvent) => {
    log(id, describeEvent(event));
    const changed = event.kind === "notification" ? LIST_CHANGED[event.method] : undefined;
    if (changed) void get().refresh(id, changed);
  };

  const persist = (server: McpServer) => repo.saveServer(getServices().documents, server);

  /** The transport as it will actually run, with variables filled in. */
  const resolved = (id: string, scopes: VariableScopes) => {
    const server = get().servers.find((s) => s.id === id);
    return server ? resolveTransport(server.transport, scopes) : null;
  };

  const open = async (id: string, transport: ResolvedTransport): Promise<ConnectOutcome> => {
    set((s) => ({ connections: { ...s.connections, [id]: EMPTY_CONNECTION } }));
    try {
      const client = await getMcpClient();
      const info = await client.connect(id, transport, onEvent(id));
      patchConnection(id, { status: "connected", info });
      await Promise.all(listsFor(info).map((kind) => get().refresh(id, kind)));
      return "connected";
    } catch (error) {
      patchConnection(id, { status: "failed", error: errorMessage(error) });
      return "failed";
    }
  };

  return {
    servers: [],
    connections: {},
    logs: {},
    trusted: [],
    loadErrors: [],

    load: async () => {
      const { documents } = getServices();
      const [loaded, trusted] = await Promise.all([
        repo.loadServers(documents),
        documents.readLocal("mcp-trust.json"),
      ]);
      set({ servers: loaded.items, loadErrors: loaded.errors, trusted: parseTrusted(trusted) });
    },

    create: (name) => {
      const server = newMcpServer(name);
      set((s) => ({ servers: [...s.servers, server] }));
      void persist(server);
      return server;
    },

    update: async (id, update) => {
      const current = get().servers.find((s) => s.id === id);
      if (!current) return;
      const next = update(current);
      set((s) => ({ servers: s.servers.map((server) => (server.id === id ? next : server)) }));
      await persist(next);
    },

    remove: async (id) => {
      const server = get().servers.find((s) => s.id === id);
      if (!server) return;
      await get().disconnect(id);
      set((s) => ({ servers: s.servers.filter((x) => x.id !== id) }));
      await repo.deleteServer(getServices().documents, server);
    },

    importConfig: async (json) => {
      const servers = serversFromConfig(json);
      set((s) => ({ servers: [...s.servers, ...servers] }));
      await Promise.all(servers.map(persist));
      return servers;
    },

    connect: async (id, scopes) => {
      const transport = resolved(id, scopes);
      if (!transport) return "failed";
      if (await needsTrust(transport, get().trusted)) return "needs-trust";
      return open(id, transport);
    },

    trustAndConnect: async (id, scopes) => {
      const transport = resolved(id, scopes);
      if (!transport) return "failed";
      const print = await fingerprint(transport);
      if (print && !get().trusted.includes(print)) {
        const trusted = [...get().trusted, print];
        set({ trusted });
        await getServices().documents.writeLocal("mcp-trust.json", JSON.stringify(trusted));
      }
      return open(id, transport);
    },

    disconnect: async (id) => {
      if (!get().connections[id]) return;
      set((s) => ({
        connections: Object.fromEntries(
          Object.entries(s.connections).filter(([key]) => key !== id),
        ),
      }));
      await (await getMcpClient()).disconnect(id).catch(() => undefined);
    },

    refresh: async (id, kind) => {
      const [field, parse] = LIST_FIELD[kind];
      try {
        const items = await (await getMcpClient()).list(id, kind);
        patchConnection(id, { [field]: parse(items) });
      } catch (error) {
        log(id, {
          at: new Date().toISOString(),
          source: "server",
          text: `Could not list ${kind}: ${errorMessage(error)}`,
        });
      }
    },

    clearLog: (id) => set((s) => ({ logs: { ...s.logs, [id]: [] } })),
  };
});
