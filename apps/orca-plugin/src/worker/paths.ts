import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FolderInfo } from "../protocol";

/** The desktop app's Tauri identifier, which names its data and config folders. */
const APP_IDENTIFIER = "com.narada.app";

export interface PlatformEnv {
  readonly platform: NodeJS.Platform;
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export const currentPlatform = (): PlatformEnv => ({
  platform: process.platform,
  home: os.homedir(),
  env: process.env,
});

export interface DesktopDirs {
  /** Local files such as globals.json, and the default `workspace` folder. */
  readonly dataDir: string;
  /** settings.json, which may name a different storage folder. */
  readonly configDir: string;
}

/** Where the desktop app keeps its files: Tauri's app data and config folders. */
export function desktopDirs({ platform, home, env }: PlatformEnv): DesktopDirs {
  if (platform === "darwin") {
    const dir = path.join(home, "Library", "Application Support", APP_IDENTIFIER);
    return { dataDir: dir, configDir: dir };
  }
  if (platform === "win32") {
    const dir = path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), APP_IDENTIFIER);
    return { dataDir: dir, configDir: dir };
  }
  return {
    dataDir: path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), APP_IDENTIFIER),
    configDir: path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), APP_IDENTIFIER),
  };
}

async function readStorageDirSetting(configDir: string): Promise<string | null> {
  try {
    const settings: unknown = JSON.parse(
      await fs.readFile(path.join(configDir, "settings.json"), "utf8"),
    );
    const dir = (settings as { storageDir?: unknown } | null)?.storageDir;
    return typeof dir === "string" && dir.trim() !== "" ? dir : null;
  } catch {
    return null;
  }
}

const isDirectory = (dir: string) =>
  fs.stat(dir).then(
    (stat) => stat.isDirectory(),
    () => false,
  );

const expandHome = (dir: string, home: string) =>
  dir === "~" || dir.startsWith("~/") ? path.join(home, dir.slice(1)) : dir;

/**
 * The folder holding Collections/ and Environments/: the plugin setting when set, else the folder
 * the desktop app was pointed at, else the desktop app's default.
 */
export async function resolveFolder(
  setting: string | null,
  dirs: DesktopDirs,
  home: string,
): Promise<FolderInfo> {
  const chosen = setting?.trim()
    ? { path: path.resolve(expandHome(setting.trim(), home)), source: "setting" as const }
    : await readStorageDirSetting(dirs.configDir).then((dir) =>
        dir
          ? { path: dir, source: "desktop" as const }
          : { path: path.join(dirs.dataDir, "workspace"), source: "default" as const },
      );
  return { ...chosen, exists: await isDirectory(path.join(chosen.path, "Collections")) };
}
