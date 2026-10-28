import { parseCurl } from "../../lib/curl";
import { errorMessage } from "../../lib/format";
import { detectImport } from "../../lib/import-detect";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

export async function runImport(text: string): Promise<string> {
  const detected = detectImport(text);
  const workspace = useWorkspaceStore.getState();
  switch (detected.kind) {
    case "curl": {
      useTabsStore.getState().openRequest(parseCurl(detected.command), null);
      useUiStore.getState().show({ kind: "requests" });
      return "Opened the curl request in a new tab.";
    }
    case "collection":
      return `Imported collection "${(await workspace.importCollection(detected.json)).name}".`;
    case "environment":
      return `Imported environment "${(await workspace.importEnvironment(detected.json)).name}".`;
  }
}

export interface NamedSource {
  readonly name: string;
  readonly load: () => Promise<string>;
}

/** Imports each source independently so one bad file doesn't block the rest. */
export async function runImports(sources: readonly NamedSource[]): Promise<string> {
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return { ok: true as const, message: await runImport(await source.load()) };
      } catch (e) {
        return { ok: false as const, message: `${source.name}: ${errorMessage(e)}` };
      }
    }),
  );
  if (results.length === 1) {
    const [only] = results;
    if (!only!.ok) throw new Error(only!.message);
    return only!.message;
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.message);
  const imported = results.length - failed.length;
  if (imported === 0) throw new Error(`Nothing was imported. ${failed.join(" ")}`);
  const summary = `Imported ${imported} of ${results.length} items.`;
  return failed.length > 0 ? `${summary} Failed: ${failed.join(" ")}` : summary;
}
