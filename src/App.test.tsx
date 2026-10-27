import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App shell", () => {
  it("shows the workspace sections", () => {
    render(<App />);
    const sidebar = screen.getByRole("complementary", { name: "Workspace" });
    for (const section of ["Collections", "Environments", "History"]) {
      expect(sidebar).toHaveTextContent(section);
    }
  });
});
