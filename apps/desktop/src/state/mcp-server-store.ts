import { create } from "zustand";
import { z } from "zod";
import { errorMessage } from "@narada/core/format";
import { getNaradaMcpClient } from "../lib/narada-mcp/client";
import { getServices } from "./services";

/** Not 6277, which the MCP Inspector uses. */
export const DEFAULT_PORT = 7377;
export const TOKEN_SECRET = "narada-mcp-token";
const SETTINGS_FILE = "mcp-server.json";
const TOKEN_BYTES = 32;

/** Kept on this computer only; the token lives in the keychain. */
export interface ServerSettings {
  readonly enabled: boolean;
  readonly port: number;
}

const DEFAULT_SETTINGS: ServerSettings = { enabled: false, port: DEFAULT_PORT };
const portSchema = z.number().int().min(1024).max(65535);
const settingsSchema = z.object({ enabled: z.boolean(), port: portSchema });

export function parseServerSettings(content: string | null): ServerSettings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(content ?? "null"));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 32 random bytes as base64url: 43 characters. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface McpServerState {
  readonly settings: ServerSettings;
  readonly loaded: boolean;
  /** The port it listens on, or null when stopped. */
  readonly runningPort: number | null;
  readonly token: string | null;
  readonly error: string | null;
  /** Reads the settings and token, and starts the server if it was left on. */
  load: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setPort: (port: number) => Promise<void>;
  /** A new token; agents set up with the old one must be set up again. */
  regenerateToken: () => Promise<void>;
}

export const useMcpServerStore = create<McpServerState>()((set, get) => {
  const save = async (settings: ServerSettings) => {
    set({ settings });
    await getServices().documents.writeLocal(SETTINGS_FILE, JSON.stringify(settings));
  };

  /** The token, read from the keychain only now that the server is wanted; made if missing. */
  const ensureToken = async (): Promise<string> => {
    const existing = get().token ?? (await getServices().secrets.get(TOKEN_SECRET));
    if (existing) {
      set({ token: existing });
      return existing;
    }
    const token = newToken();
    await getServices().secrets.set(TOKEN_SECRET, token);
    set({ token });
    return token;
  };

  /** Starts, or restarts with the current port and token. */
  const start = async () => {
    const client = getNaradaMcpClient();
    if (!client) {
      set({ error: "The MCP server needs the desktop app.", runningPort: null });
      return;
    }
    try {
      const token = await ensureToken();
      const runningPort = await client.start(get().settings.port, token);
      set({ runningPort, error: null });
    } catch (error) {
      set({ runningPort: null, error: errorMessage(error) });
    }
  };

  return {
    settings: DEFAULT_SETTINGS,
    loaded: false,
    runningPort: null,
    token: null,
    error: null,

    load: async () => {
      if (get().loaded) return;
      // Not the token: reading the keychain can make macOS ask the user, so only when needed.
      const content = await getServices().documents.readLocal(SETTINGS_FILE);
      set({ settings: parseServerSettings(content), loaded: true });
      if (get().settings.enabled) await start();
    },

    setEnabled: async (enabled) => {
      await save({ ...get().settings, enabled });
      if (enabled) {
        await start();
        return;
      }
      await getNaradaMcpClient()?.stop();
      set({ runningPort: null, error: null });
    },

    setPort: async (port) => {
      if (!portSchema.safeParse(port).success) {
        set({ error: "Choose a port from 1024 to 65535." });
        return;
      }
      await save({ ...get().settings, port });
      if (get().settings.enabled) await start();
      else set({ error: null });
    },

    regenerateToken: async () => {
      const token = newToken();
      await getServices().secrets.set(TOKEN_SECRET, token);
      set({ token });
      if (get().settings.enabled) await start();
    },
  };
});

/** Back to a fresh state, for tests. */
export function resetMcpServerStore(): void {
  useMcpServerStore.setState({
    settings: DEFAULT_SETTINGS,
    loaded: false,
    runningPort: null,
    token: null,
    error: null,
  });
}
