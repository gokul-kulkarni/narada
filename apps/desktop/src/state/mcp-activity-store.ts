import { create } from "zustand";

/** One tool call from a connected agent, for Settings → MCP server. */
export interface McpActivity {
  /** The tool call's id, so its entry can be settled when answered. */
  readonly callId: string;
  readonly at: string;
  readonly client: string | null;
  readonly tool: string;
  /** "waiting" until the app answers (e.g. while the user decides). */
  readonly outcome: "waiting" | "ok" | "error";
  /** The error, for calls that failed or were declined. */
  readonly detail: string | null;
}

const MAX_ENTRIES = 50;

interface ActivityState {
  /** Newest first; kept only while Narada runs. */
  readonly entries: readonly McpActivity[];
  record: (entry: McpActivity) => void;
  /** Sets how a recorded call ended. */
  settle: (callId: string, outcome: "ok" | "error", detail: string | null) => void;
  clear: () => void;
}

export const useMcpActivityStore = create<ActivityState>()((set) => ({
  entries: [],
  record: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) })),
  settle: (callId, outcome, detail) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.callId === callId ? { ...e, outcome, detail } : e)),
    })),
  clear: () => set({ entries: [] }),
}));
