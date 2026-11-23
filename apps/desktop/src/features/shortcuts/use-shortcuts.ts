import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useUiStore } from "../../state/ui-store";
import { COMMANDS } from "./commands";
import { matches } from "./keys";

/** Finds the command for a key press, if any. */
export function commandFor(e: KeyboardEvent) {
  return COMMANDS.find((command) => command.keys.some((spec) => matches(spec, e)));
}

/** Menu items the macOS menu bar owns, because the system would otherwise take their keys. */
const MENU_COMMANDS: Readonly<Record<string, string>> = {
  "close-tab": "tab.close",
  "next-tab": "tab.next",
  "previous-tab": "tab.previous",
};

/** The app-wide keyboard shortcuts. Dialogs and the palette handle their own keys. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { dialog, palette } = useUiStore.getState();
      if (dialog || palette || e.repeat) return;
      const command = commandFor(e);
      if (!command) return;
      e.preventDefault();
      e.stopPropagation();
      command.run();
    };
    window.addEventListener("keydown", onKey, true);

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    if (isTauri()) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<string>("menu", ({ payload }) => {
          const { dialog } = useUiStore.getState();
          if (dialog) return useUiStore.getState().closeDialog();
          if (useUiStore.getState().palette) return useUiStore.getState().closePalette();
          COMMANDS.find((c) => c.id === MENU_COMMANDS[payload])?.run();
        }).then((stop) => (cancelled ? stop() : (unlisten = stop))),
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
