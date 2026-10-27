import { create } from "zustand";
import type { HistoryEntry } from "../lib/model";

export const HISTORY_LIMIT = 200;

interface HistoryState {
  readonly entries: readonly HistoryEntry[];
  add: (entry: HistoryEntry) => void;
  replaceAll: (entries: readonly HistoryEntry[]) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  entries: [],
  add: (entry) => set((state) => ({ entries: [entry, ...state.entries].slice(0, HISTORY_LIMIT) })),
  replaceAll: (entries) => set({ entries: entries.slice(0, HISTORY_LIMIT) }),
  clear: () => set({ entries: [] }),
}));
