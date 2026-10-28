import { parseCurl } from "./curl";
import { errorMessage } from "./format";
import { detectImport, type ImportKind } from "./import-detect";
import type { CollectionItem } from "./model";
import { fromPostmanCollection } from "./postman/collection";
import { fromPostmanEnvironment } from "./postman/environment";

export type ImportPreview =
  | {
      readonly ok: true;
      readonly source: string;
      readonly kind: ImportKind;
      readonly title: string;
      readonly detail: string;
      readonly text: string;
    }
  | { readonly ok: false; readonly source: string; readonly message: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function countItems(items: readonly CollectionItem[]): { folders: number; requests: number } {
  return items.reduce(
    (total, item) => {
      if (item.kind !== "folder") return { ...total, requests: total.requests + 1 };
      const inner = countItems(item.items);
      return {
        folders: total.folders + 1 + inner.folders,
        requests: total.requests + inner.requests,
      };
    },
    { folders: 0, requests: 0 },
  );
}

function describe(
  text: string,
): Pick<Extract<ImportPreview, { ok: true }>, "kind" | "title" | "detail"> {
  const detected = detectImport(text);
  switch (detected.kind) {
    case "curl": {
      const request = parseCurl(detected.command);
      return {
        kind: "curl",
        title: `${request.method} ${request.url}`,
        detail: "cURL request · opens in a new tab",
      };
    }
    case "collection": {
      const collection = fromPostmanCollection(detected.json);
      const { folders, requests } = countItems(collection.items);
      const parts = [
        "Collection",
        ...(folders > 0 ? [plural(folders, "folder")] : []),
        plural(requests, "request"),
      ];
      return { kind: "collection", title: collection.name, detail: parts.join(" · ") };
    }
    case "environment": {
      const environment = fromPostmanEnvironment(detected.json);
      return {
        kind: "environment",
        title: environment.name,
        detail: `Environment · ${plural(environment.variables.length, "variable")}`,
      };
    }
  }
}

/** Validates an import source up front so the user sees what they're about to import. */
export function previewImport(source: string, text: string): ImportPreview {
  try {
    return { ok: true, source, text, ...describe(text) };
  } catch (e) {
    return { ok: false, source, message: errorMessage(e) };
  }
}
