import type { KeyValue } from "../model";

/** The local file holding global variables; it never syncs. */
export const GLOBALS_FILE = "globals.json";

/** Reads `globals.json`; anything unreadable counts as no globals. */
export function parseGlobals(content: string | null): KeyValue[] {
  if (!content) return [];
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed)
      ? parsed.filter(
          (row): row is KeyValue => typeof row?.key === "string" && typeof row?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}
