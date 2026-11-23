import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

/** A newer release found by the update check. */
export interface FoundUpdate {
  readonly version: string;
  readonly notes: string;
  /** Downloads, verifies the signature, installs, then restarts Narada. */
  install(onProgress: (downloaded: number, total: number | null) => void): Promise<void>;
}

export interface UpdaterPort {
  /** False in the browser build, which has nothing to update. */
  readonly available: boolean;
  currentVersion(): Promise<string>;
  /** The newer release, or null when this is the latest. */
  check(): Promise<FoundUpdate | null>;
}

/** Tauri's updater: reads latest.json from the newest GitHub release. */
const nativeUpdater: UpdaterPort = {
  available: isTauri(),
  currentVersion: () => getVersion(),
  async check() {
    // Loaded lazily so the browser build never pulls in the plugins.
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? "",
      async install(onProgress) {
        let downloaded = 0;
        let total: number | null = null;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") total = event.data.contentLength ?? null;
          if (event.event === "Progress") downloaded += event.data.chunkLength;
          onProgress(downloaded, total);
        });
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  },
};

let current: UpdaterPort = nativeUpdater;

export const getUpdater = (): UpdaterPort => current;

/** Tests swap in a fake updater. */
export function setUpdater(updater: UpdaterPort): void {
  current = updater;
}
