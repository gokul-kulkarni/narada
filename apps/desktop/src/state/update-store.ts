import { create } from "zustand";
import { errorMessage } from "@narada/core/format";
import { getUpdater, type FoundUpdate } from "../lib/updater";

export type UpdateStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "upToDate" }
  | { readonly kind: "available"; readonly version: string; readonly notes: string }
  | { readonly kind: "downloading"; readonly version: string; readonly percent: number | null }
  | { readonly kind: "failed"; readonly error: string };

interface UpdateState {
  readonly status: UpdateStatus;
  /** The person chose "Later" for the offer in the status bar, for this session. */
  readonly dismissed: boolean;
  /** `quiet` (the startup check) leaves failures unreported: no network is not an error. */
  check(options?: { readonly quiet?: boolean }): Promise<void>;
  checkOnStartup(): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

const AUTO_CHECK_KEY = "narada:update-check";

/** Whether Narada looks for a new version when it starts. A per-device preference, on by default. */
export function loadAutoCheck(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAutoCheck(on: boolean): void {
  try {
    localStorage.setItem(AUTO_CHECK_KEY, on ? "on" : "off");
  } catch {
    // Storage can be unavailable; the choice then lasts for this session only.
  }
}

/** The update found by the last check, kept outside the store: it is not serialisable state. */
let found: FoundUpdate | null = null;

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: { kind: "idle" },
  dismissed: false,

  async check({ quiet = false } = {}) {
    const updater = getUpdater();
    if (!updater.available) return;
    const before = get().status;
    if (before.kind === "checking" || before.kind === "downloading") return;
    set({ status: { kind: "checking" } });
    try {
      found = await updater.check();
      set({
        status: found
          ? { kind: "available", version: found.version, notes: found.notes }
          : { kind: "upToDate" },
        dismissed: false,
      });
    } catch (error) {
      found = null;
      set({ status: quiet ? { kind: "idle" } : { kind: "failed", error: errorMessage(error) } });
    }
  },

  async checkOnStartup() {
    if (loadAutoCheck()) await get().check({ quiet: true });
  },

  async install() {
    const update = found;
    if (!update || get().status.kind === "downloading") return;
    set({ status: { kind: "downloading", version: update.version, percent: null } });
    try {
      await update.install((downloaded, total) => {
        const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
        set({ status: { kind: "downloading", version: update.version, percent } });
      });
    } catch (error) {
      set({
        status: {
          kind: "failed",
          error: `Could not install Narada ${update.version}: ${errorMessage(error)}`,
        },
      });
    }
  },

  dismiss() {
    set({ dismissed: true });
  },
}));
