import type { Collection, CollectionItem, RequestDef } from "@narada/core/model";
import type { RequestTab } from "../../state/tabs-store";
import { PALETTE_COMMANDS, type Command } from "./commands";

export interface RequestEntry {
  readonly kind: "request";
  readonly key: string;
  readonly request: RequestDef;
  /** "Collection › Folder", or "Open tab" for a request that is not saved. */
  readonly where: string;
  readonly collectionId: string | null;
  readonly tabId: string | null;
}

export interface CommandEntry {
  readonly kind: "command";
  readonly key: string;
  readonly command: Command;
}

export type PaletteEntry = RequestEntry | CommandEntry;

function walk(
  collection: Collection,
  items: readonly CollectionItem[],
  path: readonly string[],
): RequestEntry[] {
  return items.flatMap((item): RequestEntry[] =>
    item.kind === "folder"
      ? walk(collection, item.items, [...path, item.name])
      : [
          {
            kind: "request",
            key: `${collection.id}:${item.request.id}`,
            request: item.request,
            where: path.join(" › "),
            collectionId: collection.id,
            tabId: null,
          },
        ],
  );
}

/** Every saved request, then the open tabs that are not saved anywhere. */
export function requestEntries(
  collections: readonly Collection[],
  tabs: readonly RequestTab[],
): RequestEntry[] {
  const saved = collections.flatMap((c) => walk(c, c.items, [c.name]));
  const unsaved = tabs
    .filter((tab) => !tab.source)
    .map((tab): RequestEntry => ({
      kind: "request",
      key: `tab:${tab.id}`,
      request: tab.request,
      where: "Open tab, not saved",
      collectionId: null,
      tabId: tab.id,
    }));
  return [...saved, ...unsaved];
}

export const commandEntries = (): CommandEntry[] =>
  PALETTE_COMMANDS.map((command) => ({ kind: "command", key: command.id, command }));

const haystack = (entry: PaletteEntry): string =>
  entry.kind === "command"
    ? `${entry.command.group} ${entry.command.title}`
    : `${entry.request.name} ${entry.where} ${"url" in entry.request ? entry.request.url : ""}`;

const title = (entry: PaletteEntry): string =>
  entry.kind === "command" ? entry.command.title : entry.request.name;

/**
 * Entries containing every word of the query, names that start with it first.
 * An empty query keeps the original order.
 */
export function filterEntries<T extends PaletteEntry>(
  entries: readonly T[],
  query: string,
  limit = 50,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  const words = q.split(/\s+/);
  const rank = (entry: T) => {
    const name = title(entry).toLowerCase();
    return name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
  };
  return entries
    .filter((entry) => {
      const text = haystack(entry).toLowerCase();
      return words.every((word) => text.includes(word));
    })
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
