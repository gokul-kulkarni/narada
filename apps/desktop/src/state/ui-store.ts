import { create } from "zustand";

export type MainView =
  | { readonly kind: "requests" }
  | { readonly kind: "collection"; readonly id: string }
  | { readonly kind: "environment"; readonly id: string }
  | { readonly kind: "globals" }
  | { readonly kind: "settings" }
  | { readonly kind: "runner"; readonly collectionId: string; readonly folderId: string | null }
  | { readonly kind: "mcp-server"; readonly id: string };

export type Dialog =
  | { readonly kind: "import"; readonly files?: readonly File[] }
  | { readonly kind: "save"; readonly tabId: string }
  | { readonly kind: "code"; readonly tabId: string }
  /** Confirm a local MCP server command before it first runs on this computer. */
  | { readonly kind: "mcp-trust"; readonly serverId: string };

/** ⌘P searches saved requests; ⌘⇧P searches commands. */
export type PaletteMode = "requests" | "commands";

interface UiState {
  readonly view: MainView;
  readonly palette: PaletteMode | null;
  readonly sidebarHidden: boolean;
  /** The History panel above the status bar. */
  readonly historyOpen: boolean;
  readonly dialog: Dialog | null;
  readonly notice: string | null;
  /** Collections to show expanded when they first appear in the sidebar (e.g. just imported). */
  readonly revealed: ReadonlySet<string>;
  show: (view: MainView) => void;
  openPalette: (mode: PaletteMode) => void;
  closePalette: () => void;
  toggleSidebar: () => void;
  toggleHistory: () => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  notify: (notice: string | null) => void;
  reveal: (collectionIds: readonly string[]) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: { kind: "requests" },
  palette: null,
  sidebarHidden: false,
  historyOpen: false,
  dialog: null,
  notice: null,
  revealed: new Set(),
  show: (view) => set({ view }),
  openPalette: (palette) => set({ palette }),
  closePalette: () => set({ palette: null }),
  toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  notify: (notice) => set({ notice }),
  reveal: (ids) => set((s) => ({ revealed: new Set([...s.revealed, ...ids]) })),
}));
