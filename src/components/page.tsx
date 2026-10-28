import type { ReactNode } from "react";
import { join } from "./ui";

/** A full-width screen in the main area: small label, display title, actions, then content. */
export function Page({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-8 py-6">
        <header className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-muted">{eyebrow}</div>
            {title}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export const PAGE_TITLE = "font-display text-3xl font-semibold tracking-tight";

/** A display-font heading that is also the name field, for things the user can rename. */
// "!" so these win over the base field's text-sm and padding.
export const TITLE_INPUT =
  "w-full -ml-1.5 border-transparent bg-transparent! px-1.5! py-0! font-display text-3xl! font-semibold tracking-tight hover:border-line";

export function Card({
  title,
  description,
  label,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={join(
        "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5",
        className,
      )}
    >
      {(title || description) && (
        <div>
          {title && <h3 className="font-bold">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
      {children}
    </p>
  );
}
