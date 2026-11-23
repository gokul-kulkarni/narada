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

/** What the lifted card shows while a row is dragged. */
export type DragCard =
  | { readonly kind: "request"; readonly badge: string; readonly name: string }
  | { readonly kind: "folder"; readonly name: string };

const CARD_CLASS = [
  "fixed z-[9999] pointer-events-none flex max-w-64 items-center gap-2",
  // Raised surface and a soft accent edge: it reads as the thing in hand in light and dark.
  "rounded-lg border border-accent/45 bg-surface-2 px-3 py-1.5 font-sans text-sm text-ink",
  "shadow-[0_10px_24px_-8px_rgb(0_0_0/0.35),0_2px_6px_-2px_rgb(0_0_0/0.2)]",
].join(" ");

const FOLDER_ICON =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="shrink-0 text-muted"><path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.75h5.5a1 1 0 0 1 1 1v6.75a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" stroke-linejoin="round"/></svg>';

function text(tag: string, className: string, value: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

/** The card that stands in for a dragged row; plain DOM, since the browser snapshots it. */
export function buildDragCard(card: DragCard): HTMLElement {
  const element = document.createElement("div");
  element.className = CARD_CLASS;
  element.dataset.dragCard = card.kind;
  if (card.kind === "request") {
    element.append(
      text("span", "shrink-0 font-mono text-[11px] font-semibold text-accent-text", card.badge),
    );
  } else {
    element.insertAdjacentHTML("afterbegin", FOLDER_ICON);
  }
  element.append(text("span", "truncate font-medium", card.name));
  return element;
}

/** Where the pointer holds the card, from its top-left corner. */
const GRIP = { x: 18, y: 16 };

/**
 * Makes a sidebar row draggable as `from`, shown as a lifted card instead of the browser's
 * snapshot of the row's text. `dragging` dims the row it came from while the card is out.
 */
export function useDragSource(from: MoveSource, card: DragCard) {
  const [dragging, setDragging] = useState(false);
  return {
    dragging,
    props: {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(ITEM_MIME, JSON.stringify(from));
        e.dataTransfer.effectAllowed = "move";
        // WebKit only snapshots a rendered element, so it is drawn for one frame right under
        // the pointer, where the drag image appears anyway.
        const element = buildDragCard(card);
        element.style.left = `${e.clientX - GRIP.x}px`;
        element.style.top = `${e.clientY - GRIP.y}px`;
        document.body.append(element);
        e.dataTransfer.setDragImage?.(element, GRIP.x, GRIP.y);
        setTimeout(() => element.remove(), 0);
        setDragging(true);
      },
      onDragEnd: () => setDragging(false),
    },
  };
}

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

/** Every sidebar row eases between its drag states rather than snapping. */
export const ROW_MOTION =
  "transition-[background-color,box-shadow,opacity,transform] duration-150 ease-out";

/** Classes for a row being hovered with a dragged item. */
export const dropHighlight = (state: string) =>
  state === "active" ? "bg-accent-soft ring-1 ring-accent ring-inset" : "";

/** Classes for the row a card was lifted from, and for a row that just landed. */
export const sourceState = (dragging: boolean, settling: boolean) =>
  [dragging ? "scale-[0.98] opacity-35" : "", settling ? "animate-settle" : ""].join(" ");
