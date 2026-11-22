import { isMcpServersConfig } from "./mcp/server";

export type ImportKind = "curl" | "collection" | "environment" | "mcp";

export type DetectedImport =
  | { readonly kind: "curl"; readonly command: string }
  | { readonly kind: "collection" | "environment" | "mcp"; readonly json: unknown };

/** Works out what pasted text or a dropped file contains. */
export function detectImport(text: string): DetectedImport {
  const trimmed = text.trim();
  if (/^curl\s/i.test(trimmed)) return { kind: "curl", command: trimmed };
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new Error(
      "Paste a Postman collection/environment (JSON), an mcpServers config or a curl command.",
    );
  }
  const doc = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  if (typeof doc.info === "object" && Array.isArray(doc.item)) return { kind: "collection", json };
  if (isMcpServersConfig(json)) return { kind: "mcp", json };
  if (Array.isArray(doc.values) && typeof doc.name === "string")
    return { kind: "environment", json };
  if (Array.isArray(doc.requests))
    throw new Error(
      "This is an old Postman v1 collection. In Postman, export it again and choose Collection v2.1.",
    );
  throw new Error(
    "Unrecognised JSON: expected a Postman v2.x collection or environment export, or an mcpServers config.",
  );
}
