import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

/** Saves text through the native dialog in Tauri, or a download in the browser. Returns false if cancelled. */
export async function exportTextFile(defaultName: string, content: string): Promise<boolean> {
  if (isTauri()) {
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return false;
    await invoke("export_file", { path, content });
    return true;
  }
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: defaultName });
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export const safeExportName = (name: string, suffix: string): string =>
  `${name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "export"}${suffix}`;
