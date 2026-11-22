import fs from "node:fs/promises";
import path from "node:path";
import type {
  DocumentKind,
  DocumentStore,
  LocalFile,
  StoredDocument,
} from "@narada/core/storage/document-store";

/** Same folders and file-name rules as the desktop app (src-tauri/src/storage/paths.rs). */
const KIND_DIRS: Record<DocumentKind, string> = {
  collections: "Collections",
  environments: "Environments",
  mcp: "MCP",
};

/** Plain `.json` names only, so a listed name can never point outside the folder. */
export function isDocumentName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    /^[A-Za-z0-9._-]+$/.test(name) &&
    !name.startsWith(".") &&
    !name.includes("..") &&
    name.endsWith(".json")
  );
}

const READ_ONLY = "The Orca plugin only reads Narada's files; save changes in the Narada app.";

async function readIfPresent(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Reads Narada's storage folder from Node. Read-only: writes reject, so the plugin can never
 * change files the desktop app and Drive sync own.
 */
export function createFsDocumentStore(root: string, dataDir: string): DocumentStore {
  return {
    async list(kind): Promise<StoredDocument[]> {
      const dir = path.join(root, KIND_DIRS[kind]);
      const names = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [] as string[];
        throw error;
      });
      const documents = await Promise.all(
        names.filter(isDocumentName).map(async (fileName) => {
          const content = await readIfPresent(path.join(dir, fileName)).catch(() => null);
          return content === null ? [] : [{ fileName, content }];
        }),
      );
      return documents.flat().sort((a, b) => a.fileName.localeCompare(b.fileName));
    },
    async write() {
      throw new Error(READ_ONLY);
    },
    async remove() {
      throw new Error(READ_ONLY);
    },
    readLocal: (name: LocalFile) => readIfPresent(path.join(dataDir, name)),
    async writeLocal() {
      throw new Error(READ_ONLY);
    },
  };
}
