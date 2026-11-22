import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, loadThemePreference, saveThemePreference, THEME_KEY } from "./theme";

describe("theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults to following the system", () => {
    expect(loadThemePreference()).toBe("system");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem(THEME_KEY, "sepia");
    expect(loadThemePreference()).toBe("system");
  });

  it("saves and loads an explicit choice", () => {
    saveThemePreference("dark");
    expect(loadThemePreference()).toBe("dark");
  });

  it("sets data-theme for light and dark and clears it for system", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
