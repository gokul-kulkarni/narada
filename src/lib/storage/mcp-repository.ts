import { errorMessage } from "../format";
import { MCP_SUFFIX, serverFromJson, serverToJson, type McpServer } from "../mcp/server";
import type { DocumentStore } from "./document-store";
import { fileStem, type Loaded } from "./workspace-repository";

export const serverFileName = (server: McpServer) => fileStem(server.id) + MCP_SUFFIX;

export async function loadServers(store: DocumentStore): Promise<Loaded<McpServer>> {
  const docs = await store.list("mcp");
  return docs.reduce<Loaded<McpServer>>(
    (acc, doc) => {
      try {
        return { ...acc, items: [...acc.items, serverFromJson(doc.content)] };
      } catch (error) {
        return {
          ...acc,
          errors: [...acc.errors, { fileName: doc.fileName, message: errorMessage(error) }],
        };
      }
    },
    { items: [], errors: [] },
  );
}

export const saveServer = (store: DocumentStore, server: McpServer) =>
  store.write("mcp", serverFileName(server), `${serverToJson(server)}\n`);

export const deleteServer = (store: DocumentStore, server: McpServer) =>
  store.remove("mcp", serverFileName(server));
