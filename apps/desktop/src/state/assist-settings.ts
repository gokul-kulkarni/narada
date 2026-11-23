import { z } from "zod";
import type { DetectedAgent } from "../lib/assist/client";

/** Stored on this computer only (assist.json), never in the synced folder: paths are per machine. */
export interface AssistSettings {
  /** Agents the user confirmed, by `agentFingerprint`; a new path or version asks again. */
  readonly trusted: readonly string[];
  readonly skipPreview: boolean;
  /** The folder agents may read when a request's collection has none of its own. */
  readonly defaultFolder: string | null;
  /** Project folders by collection id. */
  readonly collectionFolders: Readonly<Record<string, string>>;
}

export const SETTINGS_FILE = "assist.json";

export const DEFAULT_SETTINGS: AssistSettings = {
  trusted: [],
  skipPreview: false,
  defaultFolder: null,
  collectionFolders: {},
};

// Fields added later default, so files saved by earlier versions still load.
const settingsSchema = z.object({
  trusted: z.array(z.string()),
  skipPreview: z.boolean(),
  defaultFolder: z.string().nullable().default(null),
  collectionFolders: z.record(z.string(), z.string()).default({}),
});

export const agentFingerprint = (agent: DetectedAgent): string => `${agent.path}@${agent.version}`;

export function parseSettings(content: string | null): AssistSettings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(content ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Settings with a project folder set or cleared: for a collection, or the default with null. */
export function withFolder(
  settings: AssistSettings,
  collectionId: string | null,
  folder: string | null,
): AssistSettings {
  if (collectionId === null) return { ...settings, defaultFolder: folder };
  const others = Object.fromEntries(
    Object.entries(settings.collectionFolders).filter(([id]) => id !== collectionId),
  );
  return {
    ...settings,
    collectionFolders: folder === null ? others : { ...others, [collectionId]: folder },
  };
}

/** The folder an agent may read for a request in `collectionId` (null: an empty folder). */
export const folderFor = (settings: AssistSettings, collectionId: string | null): string | null =>
  (collectionId !== null ? settings.collectionFolders[collectionId] : undefined) ??
  settings.defaultFolder;
