import { useEffect } from "react";
import { useUiStore } from "../state/ui-store";

const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

/** Dropping files anywhere in the window opens the Import dialog with them. */
export function useFileDrop() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault(); // required for the drop event to fire
    };
    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault(); // stop the webview from navigating to the file
      useUiStore.getState().openDialog({ kind: "import", files });
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
