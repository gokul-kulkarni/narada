import { useState, type DragEvent } from "react";
import type { MoveSource, MoveTarget } from "@narada/core/collection-tree";
import { moveCollectionItem } from "./collection-actions";

/** The drag payload type for sidebar items, so other drags (files, text) are ignored. */
export const ITEM_MIME = "application/x-narada-item";

const carriesItem = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(ITEM_MIME);

function readSource(e: DragEvent): MoveSource | null {
  try {
    const value: unknown = JSON.parse(e.dataTransfer.getData(ITEM_MIME));
    if (typeof value !== "object" || value === null) return null;
    const { collectionId, itemId } = value as Record<string, unknown>;
    return typeof collectionId === "string" && typeof itemId === "string"
      ? { collectionId, itemId }
      : null;
  } catch {
    return null;
  }
}

/** Makes a sidebar row draggable as `from`. */
export const dragSource = (from: MoveSource) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => {
    e.dataTransfer.setData(ITEM_MIME, JSON.stringify(from));
    e.dataTransfer.effectAllowed = "move";
  },
});

/** Makes a folder or collection row accept dropped items, highlighting while one is over it. */
export function useDropTarget(to: MoveTarget) {
  const [over, setOver] = useState(false);
  return {
    "data-drop-target": over ? "active" : "idle",
    onDragOver: (e: DragEvent) => {
      if (!carriesItem(e)) return;
      e.preventDefault(); // allows the drop
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      setOver(false);
      const from = readSource(e);
      if (!from) return;
      e.preventDefault();
      e.stopPropagation(); // the innermost folder takes it, not its parents
      moveCollectionItem(from, to);
    },
  };
}

/** Classes for a row being hovered with a dragged item. */
export const dropHighlight = (state: string) =>
  state === "active" ? "ring-2 ring-accent ring-inset" : "";
