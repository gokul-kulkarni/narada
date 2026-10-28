import type { ResolvedTransport } from "./server";

/**
 * A stdio server runs a command on this computer. Server files arrive by Drive sync and
 * import, so before a command first runs here the user confirms it. What they confirm is
 * the command as it will actually run (variables resolved), its arguments and the names of
 * its environment variables; any change asks again. Only a SHA-256 hash is stored (resolved
 * arguments may hold tokens), on this machine only (mcp-trust.json, never synced).
 */
export async function fingerprint(transport: ResolvedTransport): Promise<string | null> {
  if (transport.type !== "stdio") return null;
  const envNames = transport.env.map(([name]) => name).sort();
  const text = JSON.stringify([transport.command, transport.args, envNames]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseTrusted(content: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(content ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

export async function needsTrust(
  transport: ResolvedTransport,
  trusted: readonly string[],
): Promise<boolean> {
  const print = await fingerprint(transport);
  return print !== null && !trusted.includes(print);
}
