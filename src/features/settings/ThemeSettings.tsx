import { useState } from "react";
import { join } from "../../components/ui";
import {
  applyTheme,
  loadThemePreference,
  saveThemePreference,
  THEME_OPTIONS,
  type ThemePreference,
} from "../../lib/theme";

const LABELS: Record<ThemePreference, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

export function ThemeSettings() {
  const [theme, setTheme] = useState(loadThemePreference);
  const choose = (next: ThemePreference) => {
    setTheme(next);
    saveThemePreference(next);
    applyTheme(next);
  };

  return (
    <section aria-label="Appearance" className="space-y-2">
      <h3 className="font-semibold">Appearance</h3>
      <div role="radiogroup" aria-label="Theme" className="flex gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={theme === option}
            onClick={() => choose(option)}
            className={join(
              "rounded-lg border px-3 py-1.5 text-sm",
              theme === option
                ? "border-accent bg-accent-soft font-bold text-accent-soft-ink"
                : "border-line hover:bg-surface-2",
            )}
          >
            {LABELS[option]}
          </button>
        ))}
      </div>
    </section>
  );
}
