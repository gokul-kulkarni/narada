import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export const canUseNativeStorage = (): boolean => isTauri();

export const getStorageDir = (): Promise<string> =>
  isTauri() ? invoke<string>("get_storage_dir") : Promise.resolve("Browser storage (localStorage)");

/** `null` resets to the default folder inside the app's data directory. */
export const setStorageDir = (path: string | null): Promise<string> =>
  invoke<string>("set_storage_dir", { path });

export async function pickFolder(): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Choose a folder for Collections and Environments",
  });
  return typeof picked === "string" ? picked : null;
}
