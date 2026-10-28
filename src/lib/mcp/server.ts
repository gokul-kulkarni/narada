import { z } from "zod";
import { newKeyValue } from "../factories";
import { newId } from "../ids";
import type { KeyValue } from "../model";
import { resolveTemplate, type VariableScopes } from "../variables";

/** Launch the server locally and talk over its stdin/stdout. */
export interface StdioTransport {
  readonly type: "stdio";
  readonly command: string;
  readonly args: readonly string[];
  readonly env: readonly KeyValue[];
  readonly cwd: string;
}

/** Reach a running server over Streamable HTTP. */
export interface HttpTransport {
  readonly type: "http";
  readonly url: string;
  readonly headers: readonly KeyValue[];
}

export type McpTransport = StdioTransport | HttpTransport;

/** A saved MCP server, synced like collections. Values may use {{variables}}. */
export interface McpServer {
  readonly id: string;
  readonly name: string;
  readonly transport: McpTransport;
}

/** What the Rust side and the browser client receive: variables resolved, disabled rows dropped. */
export type ResolvedTransport =
  | {
      readonly type: "stdio";
      readonly command: string;
      readonly args: readonly string[];
      readonly env: readonly (readonly [string, string])[];
      readonly cwd: string | null;
    }
  | {
      readonly type: "http";
      readonly url: string;
      readonly headers: readonly (readonly [string, string])[];
    };

const rowSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional(),
});
const rows = z.array(rowSchema).default([]);

const fileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  transport: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("stdio"),
      command: z.string(),
      args: z.array(z.string()).default([]),
      env: rows,
      cwd: z.string().default(""),
    }),
    z.object({ type: z.literal("http"), url: z.string(), headers: rows }),
  ]),
});

const toKeyValues = (list: readonly z.infer<typeof rowSchema>[]): KeyValue[] =>
  list.map((row) => ({ ...newKeyValue(row.key, row.value), enabled: row.enabled ?? true }));
const fromKeyValues = (list: readonly KeyValue[]) =>
  list.map(({ key, value, enabled }) => ({ key, value, enabled }));

export const newMcpServer = (name = "New MCP server"): McpServer => ({
  id: newId(),
  name,
  transport: { type: "stdio", command: "", args: [], env: [], cwd: "" },
});

export const emptyTransport = (type: McpTransport["type"]): McpTransport =>
  type === "stdio"
    ? { type, command: "", args: [], env: [], cwd: "" }
    : { type, url: "", headers: [] };

export const MCP_SUFFIX = ".mcp.json";

export function serverToJson(server: McpServer): string {
  const { transport } = server;
  const stored =
    transport.type === "stdio"
      ? { ...transport, env: fromKeyValues(transport.env) }
      : { ...transport, headers: fromKeyValues(transport.headers) };
  return JSON.stringify({ id: server.id, name: server.name, transport: stored }, null, 2);
}

/** Parses a stored server file; throws a readable error for anything else. */
export function serverFromJson(content: string): McpServer {
  const parsed = fileSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error("Not a Narada MCP server file.");
  const { id, name, transport } = parsed.data;
  return {
    id,
    name,
    transport:
      transport.type === "stdio"
        ? { ...transport, env: toKeyValues(transport.env) }
        : { ...transport, headers: toKeyValues(transport.headers) },
  };
}

const enabledPairs = (list: readonly KeyValue[], scopes: VariableScopes) =>
  list
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => [row.key.trim(), resolveTemplate(row.value, scopes)] as const);

export function resolveTransport(
  transport: McpTransport,
  scopes: VariableScopes,
): ResolvedTransport {
  const resolve = (text: string) => resolveTemplate(text, scopes);
  return transport.type === "stdio"
    ? {
        type: "stdio",
        command: resolve(transport.command).trim(),
        args: transport.args.map(resolve),
        env: enabledPairs(transport.env, scopes),
        cwd: resolve(transport.cwd).trim() || null,
      }
    : {
        type: "http",
        url: resolve(transport.url).trim(),
        headers: enabledPairs(transport.headers, scopes),
      };
}

/** One line describing where the server is, e.g. `npx -y server-everything`. */
export function describeTransport(transport: McpTransport): string {
  return transport.type === "stdio"
    ? [transport.command, ...transport.args].join(" ").trim()
    : transport.url;
}

/** Splits an arguments line like a shell would for simple quoting: `a "b c" 'd'`. */
export function splitArgs(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

export const joinArgs = (args: readonly string[]) =>
  args.map((arg) => (/\s/.test(arg) || arg === "" ? `"${arg}"` : arg)).join(" ");

const configEntry = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

/** Detects the `{"mcpServers": {...}}` config used by Claude Desktop, Cursor and others. */
export const isMcpServersConfig = (json: unknown): boolean =>
  typeof json === "object" &&
  json !== null &&
  typeof (json as Record<string, unknown>).mcpServers === "object";

export function serversFromConfig(json: unknown): McpServer[] {
  const config = z.object({ mcpServers: z.record(z.string(), configEntry) }).safeParse(json);
  if (!config.success) throw new Error('Expected {"mcpServers": {"name": {...}}}.');
  return Object.entries(config.data.mcpServers).map(([name, entry]) => {
    const pairs = (record: Record<string, string> = {}) =>
      Object.entries(record).map(([key, value]) => newKeyValue(key, value));
    if (entry.url) {
      return {
        id: newId(),
        name,
        transport: { type: "http", url: entry.url, headers: pairs(entry.headers) },
      };
    }
    if (!entry.command) throw new Error(`Server "${name}" has neither a command nor a url.`);
    return {
      id: newId(),
      name,
      transport: {
        type: "stdio",
        command: entry.command,
        args: entry.args ?? [],
        env: pairs(entry.env),
        cwd: entry.cwd ?? "",
      },
    };
  });
}
