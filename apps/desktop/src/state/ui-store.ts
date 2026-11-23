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
  /** Pick where a sidebar request or folder moves to. */
  | { readonly kind: "move"; readonly collectionId: string; readonly itemId: string }
  /** Confirm a local MCP server command before it first runs on this computer. */
  | { readonly kind: "mcp-trust"; readonly serverId: string }
  /** Show which agent will run and the redacted prompt before it is sent. */
  | { readonly kind: "assist-preview"; readonly tabId: string; readonly agentId: string };

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
  /** A sidebar item that was just moved, so its row can settle into place. */
  readonly justMoved: string | null;
  show: (view: MainView) => void;
  openPalette: (mode: PaletteMode) => void;
  closePalette: () => void;
  toggleSidebar: () => void;
  toggleHistory: () => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  notify: (notice: string | null) => void;
  reveal: (collectionIds: readonly string[]) => void;
  markMoved: (itemId: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: { kind: "requests" },
  palette: null,
  sidebarHidden: false,
  historyOpen: false,
  dialog: null,
  notice: null,
  revealed: new Set(),
  justMoved: null,
  show: (view) => set({ view }),
  openPalette: (palette) => set({ palette }),
  closePalette: () => set({ palette: null }),
  toggleSidebar: () => set((s) => ({ sidebarHidden: !s.sidebarHidden })),
  toggleHistory: () => set((s) => ({ historyOpen: !s.historyOpen })),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  notify: (notice) => set({ notice }),
  reveal: (ids) => set((s) => ({ revealed: new Set([...s.revealed, ...ids]) })),
  markMoved: (itemId) => {
    set({ justMoved: itemId });
    // Long enough for the settle animation, then the row is ordinary again.
    setTimeout(() => set((s) => (s.justMoved === itemId ? { justMoved: null } : s)), 900);
  },
}));
