import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { loadThemePreference } from "../../lib/theme";
import { ThemeSettings } from "./ThemeSettings";

describe("ThemeSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("matches the system by default and applies and remembers a choice", () => {
    render(<ThemeSettings />);
    expect(screen.getByRole("radio", { name: "Match system" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(loadThemePreference()).toBe("dark");
  });
});
