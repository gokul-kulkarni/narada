import { create } from "zustand";

export type MainView =
  | { readonly kind: "requests" }
  | { readonly kind: "collection"; readonly id: string }
  | { readonly kind: "environment"; readonly id: string }
  | { readonly kind: "globals" }
  | { readonly kind: "settings" }
  | { readonly kind: "runner"; readonly collectionId: string; readonly folderId: string | null };

export type Dialog =
  | { readonly kind: "import" }
  | { readonly kind: "save"; readonly tabId: string }
  | { readonly kind: "code"; readonly tabId: string };

interface UiState {
  readonly view: MainView;
  readonly dialog: Dialog | null;
  readonly notice: string | null;
  show: (view: MainView) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  notify: (notice: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: { kind: "requests" },
  dialog: null,
  notice: null,
  show: (view) => set({ view }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  notify: (notice) => set({ notice }),
}));
