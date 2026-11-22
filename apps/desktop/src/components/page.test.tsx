import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, ErrorText, Page } from "./page";

describe("page building blocks", () => {
  it("renders a page header with actions and content", () => {
    render(
      <Page eyebrow="Collection" title={<h2>Pets</h2>} actions={<button>Run</button>}>
        <p>body</p>
      </Page>,
    );
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("labels a card and shows its title and description", () => {
    render(
      <Card label="Variables" title="Variables" description="Used as {{name}}">
        rows
      </Card>,
    );
    const card = screen.getByRole("region", { name: "Variables" });
    expect(card).toHaveTextContent("Used as {{name}}");
    expect(card).toHaveTextContent("rows");
  });

  it("announces errors", () => {
    render(<ErrorText>broken</ErrorText>);
    expect(screen.getByRole("alert")).toHaveTextContent("broken");
  });
});
