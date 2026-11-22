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

const READ_ONLY =
  "The Orca plugin only adds requests to collections; make other changes in the Narada app.";

async function readIfPresent(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Replaces a file in one step: a reader (or a crash) never sees it half-written. */
async function writeWhole(file: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Narada's storage folder from Node. The plugin only reads, except that it may rewrite a
 * collection file to add a request to it; environments, local files and deletes are refused.
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
    async write(kind, fileName, content) {
      if (kind !== "collections") throw new Error(READ_ONLY);
      if (!isDocumentName(fileName)) throw new Error(`${fileName} is not a collection file name.`);
      await writeWhole(path.join(root, KIND_DIRS.collections, fileName), content);
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
