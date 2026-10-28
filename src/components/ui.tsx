import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

export const join = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-send font-bold text-send-ink hover:bg-send-hover disabled:opacity-50",
  secondary: "border border-line bg-surface font-semibold hover:bg-surface-2",
  ghost: "hover:bg-surface-2",
  danger: "text-err hover:bg-err-soft",
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
        "rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

const FIELD =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={join(FIELD, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={join(FIELD, className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea spellCheck={false} className={join(FIELD, "font-mono", className)} {...props} />;
}

const TAB_STYLES = {
  underline: {
    list: "flex gap-1 border-b border-line",
    tab: "-mb-px border-b-2 px-3 py-1.5 text-sm font-semibold",
    active: "border-accent text-ink",
    idle: "border-transparent text-muted hover:text-ink",
  },
  chips: {
    list: "flex flex-wrap gap-1.5",
    tab: "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
    active: "bg-accent-soft text-accent-soft-ink",
    idle: "bg-surface-2 text-muted hover:text-ink",
  },
} as const;

export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
  label,
  variant = "underline",
}: {
  tabs: readonly { id: T; label: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  variant?: keyof typeof TAB_STYLES;
}) {
  const styles = TAB_STYLES[variant];
  return (
    <div role="tablist" aria-label={label} className={styles.list}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
          className={join(styles.tab, tab.id === active ? styles.active : styles.idle)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-bold text-muted">{children}</h2>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-4 text-center text-sm text-muted">{children}</div>;
}
