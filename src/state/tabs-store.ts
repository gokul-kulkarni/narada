import { create } from "zustand";
import { newRequest } from "../lib/factories";
import { newId } from "../lib/ids";
import type { HttpResponse, RequestDef } from "../lib/model";
import type { TestResult } from "../lib/scripts/types";

export interface RequestSource {
  readonly collectionId: string;
  readonly requestId: string;
}

export interface RequestTab {
  readonly id: string;
  readonly request: RequestDef;
  readonly source: RequestSource | null;
  readonly dirty: boolean;
  readonly loading: boolean;
  readonly response: HttpResponse | null;
  readonly error: string | null;
  readonly tests: readonly TestResult[];
  readonly logs: readonly string[];
}

interface TabsState {
  readonly tabs: readonly RequestTab[];
  readonly activeTabId: string | null;
  openNew: () => string;
  openRequest: (request: RequestDef, source: RequestSource | null) => string;
  close: (tabId: string) => void;
  activate: (tabId: string) => void;
  updateRequest: (tabId: string, update: (request: RequestDef) => RequestDef) => void;
  patchTab: (tabId: string, patch: Partial<Omit<RequestTab, "id">>) => void;
}

const createTab = (request: RequestDef, source: RequestSource | null): RequestTab => ({
  id: newId(),
  request,
  source,
  dirty: false,
  loading: false,
  response: null,
  error: null,
  tests: [],
  logs: [],
});

const mapTab = (
  tabs: readonly RequestTab[],
  tabId: string,
  update: (tab: RequestTab) => RequestTab,
): RequestTab[] => tabs.map((tab) => (tab.id === tabId ? update(tab) : tab));

export const useTabsStore = create<TabsState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  openNew: () => get().openRequest(newRequest(), null),

  openRequest: (request, source) => {
    const existing = source
      ? get().tabs.find((tab) => tab.source?.requestId === source.requestId)
      : undefined;
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }
    const tab = createTab(request, source);
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  close: (tabId) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId =
        state.activeTabId === tabId
          ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
          : state.activeTabId;
      return { tabs, activeTabId };
    }),

  activate: (tabId) => set({ activeTabId: tabId }),

  updateRequest: (tabId, update) =>
    set((state) => ({
      tabs: mapTab(state.tabs, tabId, (tab) => ({
        ...tab,
        request: update(tab.request),
        dirty: true,
      })),
    })),

  patchTab: (tabId, patch) =>
    set((state) => ({ tabs: mapTab(state.tabs, tabId, (tab) => ({ ...tab, ...patch })) })),
}));

export const selectActiveTab = (state: TabsState): RequestTab | undefined =>
  state.tabs.find((tab) => tab.id === state.activeTabId);
