import { useState } from "react";

export interface ItemAction {
  readonly label: string;
  readonly onSelect: () => void;
  readonly danger?: boolean;
}

/** Compact "⋯" menu; destructive actions ask for a second click instead of a blocking dialog. */
export function ItemActions({ name, actions }: { name: string; actions: readonly ItemAction[] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const select = (action: ItemAction) => {
    if (action.danger && confirming !== action.label) {
      setConfirming(action.label);
      return;
    }
    setOpen(false);
    setConfirming(null);
    action.onSelect();
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        aria-expanded={open}
        className="rounded px-1 text-muted hover:bg-line-soft hover:text-ink"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
          setConfirming(null);
        }}
      >
        ⋯
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 rounded border border-line bg-surface py-1 text-sm shadow-lg"
        >
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                role="menuitem"
                className={`w-full px-3 py-1 text-left hover:bg-surface-2 ${action.danger ? "text-err" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  select(action);
                }}
              >
                {confirming === action.label
                  ? `Confirm ${action.label.toLowerCase()}?`
                  : action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
