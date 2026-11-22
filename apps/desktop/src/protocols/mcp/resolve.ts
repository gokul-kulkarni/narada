import { readToolResult } from "../../lib/mcp/results";
import { checkArguments, fieldsFor } from "../../lib/mcp/schema-form";
import type { JsonObject, McpOperation } from "../../lib/model";
import { resolveTemplate, type VariableScopes } from "../../lib/variables";
import type { Connection } from "../../state/mcp-store";

/** Replaces {{variables}} in every string inside a JSON value. */
function resolveDeep(value: unknown, scopes: VariableScopes): unknown {
  if (typeof value === "string") return resolveTemplate(value, scopes);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, scopes));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, scopes)]));
  }
  return value;
}

const describeErrors = (errors: Readonly<Record<string, string>>) =>
  Object.entries(errors)
    .map(([name, error]) => `${name}: ${error}`)
    .join("; ");

/** Prompt arguments are strings in MCP. */
const asStrings = (args: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );

/**
 * The operation as sent: variables resolved, tool arguments typed by the tool's schema.
 * Throws a readable message when arguments do not fit.
 */
export function resolveOperation(
  operation: McpOperation,
  scopes: VariableScopes,
  connection: Connection | undefined,
): McpOperation {
  switch (operation.type) {
    case "resource":
      if (!operation.uri.trim()) throw new Error("Choose a resource to read.");
      return { ...operation, uri: resolveTemplate(operation.uri, scopes).trim() };
    case "prompt": {
      if (!operation.name) throw new Error("Choose a prompt.");
      const args = resolveDeep(operation.arguments, scopes) as JsonObject;
      const blankless = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== ""));
      return { ...operation, arguments: asStrings(blankless) };
    }
    case "tool": {
      if (!operation.name) throw new Error("Choose a tool.");
      const args = resolveDeep(operation.arguments, scopes) as JsonObject;
      const tool = connection?.tools.find((t) => t.name === operation.name);
      if (!tool) return { ...operation, arguments: args };
      const checked = checkArguments(fieldsFor(tool.inputSchema), args);
      if (!checked.ok) throw new Error(`Check the arguments: ${describeErrors(checked.errors)}`);
      return { ...operation, arguments: checked.arguments };
    }
  }
}

export const toolFailed = (operation: McpOperation, result: unknown) =>
  operation.type === "tool" && readToolResult(result).isError;
