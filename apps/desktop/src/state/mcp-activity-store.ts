import { create } from "zustand";

/** One tool call from a connected agent, for Settings → MCP server. */
export interface McpActivity {
  readonly at: string;
  readonly client: string | null;
  readonly tool: string;
  readonly outcome: "ok" | "error";
  /** The error, for calls that failed or were declined. */
  readonly detail: string | null;
}

const MAX_ENTRIES = 50;

interface ActivityState {
  /** Newest first; kept only while Narada runs. */
  readonly entries: readonly McpActivity[];
  record: (entry: McpActivity) => void;
  clear: () => void;
}

export const useMcpActivityStore = create<ActivityState>()((set) => ({
  entries: [],
  record: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) })),
  clear: () => set({ entries: [] }),
}));
