import { parseCurl } from "../../lib/curl";
import { errorMessage } from "../../lib/format";
import { detectImport } from "../../lib/import-detect";
import type { ImportPreview } from "../../lib/import-preview";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

type Imported =
  { readonly kind: "curl" | "environment" } | { readonly kind: "collection"; readonly id: string };

async function runImport(text: string): Promise<Imported> {
  const detected = detectImport(text);
  const workspace = useWorkspaceStore.getState();
  switch (detected.kind) {
    case "curl":
      useTabsStore.getState().openRequest(parseCurl(detected.command), null);
      return { kind: "curl" };
    case "collection":
      return { kind: "collection", id: (await workspace.importCollection(detected.json)).id };
    case "environment":
      await workspace.importEnvironment(detected.json);
      return { kind: "environment" };
  }
}

function summary(previews: readonly ImportPreview[], failed: readonly string[]): string {
  const imported = previews.length - failed.length;
  const [first] = previews;
  const head =
    previews.length === 1 && first?.ok
      ? first.kind === "curl"
        ? "Opened the curl request in a new tab."
        : `Imported ${first.kind} "${first.title}".`
      : `Imported ${imported} of ${previews.length} items.`;
  return failed.length > 0 ? `${head} Failed: ${failed.join(" ")}` : head;
}

/** Imports validated previews one by one, then shows what was imported. */
export async function importPreviews(previews: readonly ImportPreview[]): Promise<string> {
  const valid = previews.filter((p) => p.ok);
  const failed: string[] = [];
  const results: Imported[] = [];
  for (const preview of valid) {
    try {
      results.push(await runImport(preview.text));
    } catch (e) {
      failed.push(`${preview.source}: ${errorMessage(e)}`);
    }
  }
  if (results.length === 0) throw new Error(`Nothing was imported. ${failed.join(" ")}`);
  const collections = results.flatMap((r) => (r.kind === "collection" ? [r.id] : []));
  const ui = useUiStore.getState();
  ui.reveal(collections);
  ui.show({ kind: "requests" });
  return summary(valid, failed);
}
