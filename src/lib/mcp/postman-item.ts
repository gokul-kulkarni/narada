import { z } from "zod";
import { newId } from "../ids";
import type { McpOperation, McpRequestDef } from "../model";

/**
 * Postman collections have no MCP item type, so an MCP request is stored as an ordinary
 * item with a placeholder HTTP request (Postman still opens the file) and the real request
 * under a `narada` extension field, which Narada reads back.
 */
const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({ type: z.literal("resource"), uri: z.string() }),
  z.object({
    type: z.literal("prompt"),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).default({}),
  }),
]);

const extensionSchema = z.object({
  protocol: z.literal("mcp"),
  serverId: z.string(),
  operation: operationSchema,
});

const operationLabel = (operation: McpOperation) =>
  operation.type === "resource" ? operation.uri : operation.name;

export function mcpItemToPostman(request: McpRequestDef): object {
  return {
    id: request.id,
    name: request.name,
    request: {
      method: "POST",
      header: [],
      url: `mcp://${request.serverId}/${request.operation.type}/${operationLabel(request.operation)}`,
      description: "MCP request created in Narada.",
    },
    narada: { protocol: "mcp", serverId: request.serverId, operation: request.operation },
  };
}

/** The MCP request stored in a Postman item, or null for an ordinary HTTP item. */
export function mcpItemFromPostman(item: Record<string, unknown>): McpRequestDef | null {
  const extension = extensionSchema.safeParse(item.narada);
  if (!extension.success) return null;
  return {
    protocol: "mcp",
    id: typeof item.id === "string" ? item.id : newId(),
    name: String(item.name ?? "MCP request"),
    serverId: extension.data.serverId,
    operation: extension.data.operation,
  };
}
