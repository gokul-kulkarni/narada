import { useEffect } from "react";
import type { HistoryEntry } from "../lib/model";
import { useHistoryStore } from "../state/history-store";
import { getServices } from "../state/services";
import { useTabsStore } from "../state/tabs-store";
import { useUiStore } from "../state/ui-store";
import { useWorkspaceStore } from "../state/workspace-store";

const HISTORY_SAVE_DELAY_MS = 500;

/** History saved before requests had a protocol holds HTTP requests only. */
const withProtocol = (entry: HistoryEntry): HistoryEntry =>
  entry.request.protocol ? entry : { ...entry, request: { ...entry.request, protocol: "http" } };

function parseHistory(content: string | null): HistoryEntry[] {
  if (!content) return [];
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed)
      ? parsed
          .filter((e) => typeof e?.id === "string" && typeof e?.request === "object")
          .map(withProtocol)
      : [];
  } catch {
    return [];
  }
}

/** Loads the workspace and history once, then persists history changes (debounced). */
export function useBootstrap(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const { documents } = getServices();

    void useWorkspaceStore.getState().load();
    void documents.readLocal("history.json").then((content) => {
      if (!cancelled) useHistoryStore.getState().replaceAll(parseHistory(content));
    });

    const unsubscribe = useHistoryStore.subscribe((state, previous) => {
      if (state.entries === previous.entries) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void documents
          .writeLocal("history.json", JSON.stringify(state.entries))
          .catch(() => undefined);
      }, HISTORY_SAVE_DELAY_MS);
    });

    // Opening or switching a request tab always brings the request view forward.
    const unsubscribeTabs = useTabsStore.subscribe((state, previous) => {
      if (state.activeTabId && state.activeTabId !== previous.activeTabId) {
        useUiStore.getState().show({ kind: "requests" });
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      unsubscribeTabs();
    };
  }, []);
}
