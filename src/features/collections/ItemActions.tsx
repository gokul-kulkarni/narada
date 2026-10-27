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
        className="rounded px-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-800"
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
          className="absolute right-0 z-20 mt-1 w-44 rounded border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                role="menuitem"
                className={`w-full px-3 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${action.danger ? "text-red-600" : ""}`}
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
