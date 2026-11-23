import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

const STORAGE_KEY = "narada:request-pane-height";
/** Smallest height either side can be dragged to. */
const MIN = 96;
const KEY_STEP = 32;

function loadHeight(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveHeight(height: number | null): void {
  try {
    if (height === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
  } catch {
    // Storage can be unavailable; the size then lasts for this session.
  }
}

/**
 * The request above, its response below, with a divider to drag between them.
 * Until it is dragged the top keeps its natural height (up to about half the space);
 * double-clicking the divider goes back to that.
 */
export function SplitPane({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const topPane = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(loadHeight);

  const clamp = (value: number) => {
    const total = container.current?.clientHeight ?? 0;
    return total > 2 * MIN ? Math.min(Math.max(value, MIN), total - MIN) : value;
  };
  const resize = (value: number | null) => {
    const next = value === null ? null : clamp(value);
    setHeight(next);
    saveHeight(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = topPane.current?.offsetHeight ?? 0;
    const divider = e.currentTarget;
    divider.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => resize(startHeight + ev.clientY - startY);
    const up = () => {
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", up);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: -KEY_STEP, ArrowDown: KEY_STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    resize((topPane.current?.offsetHeight ?? 0) + step);
  };

  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={topPane}
        className={`shrink-0 overflow-y-auto bg-surface ${height === null ? "max-h-[55%]" : ""}`}
        style={height === null ? undefined : { height }}
      >
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize request and response"
        title="Drag to resize · double-click to reset"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onDoubleClick={() => resize(null)}
        onKeyDown={onKeyDown}
        className="group relative h-px shrink-0 cursor-row-resize bg-line outline-none"
      >
        {/* A taller invisible grip than the 1px line. */}
        <span className="absolute inset-x-0 -top-1.5 -bottom-1.5 group-hover:bg-accent/30 group-focus-visible:bg-accent/40" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{bottom}</div>
    </div>
  );
}
