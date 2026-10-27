import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

const join = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-orange-600 text-white hover:bg-orange-500 disabled:bg-orange-600/50",
  secondary:
    "border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
  ghost: "hover:bg-neutral-100 dark:hover:bg-neutral-800",
  danger: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={join(
        "rounded px-3 py-1.5 text-sm disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

const FIELD =
  "rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-orange-500 dark:border-neutral-700";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={join(FIELD, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={join(FIELD, "dark:bg-neutral-900", className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} className={join(FIELD, "font-mono", className)} {...props} />;
}

export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={join(
            "-mb-px border-b-2 px-3 py-1.5 text-sm",
            tab.id === active ? "border-orange-500" : "border-transparent text-neutral-500",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-4 text-center text-sm text-neutral-500">{children}</div>;
}
