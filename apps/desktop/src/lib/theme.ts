export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "narada:theme";
export const THEME_OPTIONS: readonly ThemePreference[] = ["system", "light", "dark"];

const isTheme = (value: unknown): value is ThemePreference =>
  THEME_OPTIONS.includes(value as ThemePreference);

/** The theme lives in localStorage: it is a per-device preference, not workspace data. */
export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this session.
  }
}

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
