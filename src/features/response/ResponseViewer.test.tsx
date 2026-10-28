import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HttpResponse } from "../../lib/model";
import { ResponseViewer } from "./ResponseViewer";

const response = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 404,
  statusText: "Not Found",
  headers: [["content-type", "application/json"]],
  body: '{"a":1}',
  isBinary: false,
  sizeBytes: 7,
  timeMs: 12,
  ...overrides,
});

describe("ResponseViewer", () => {
  it("switches between pretty, raw, headers and tests", () => {
    render(
      <ResponseViewer
        response={response()}
        testResults={<p>all good</p>}
        testSummary="Tests (1/1)"
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByLabelText("Response body")).toHaveValue('{"a":1}');
    fireEvent.click(screen.getByRole("tab", { name: "Headers (1)" }));
    expect(screen.getByText("application/json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Tests (1/1)" }));
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("flags binary bodies", () => {
    render(<ResponseViewer response={response({ isBinary: true, headers: [] })} />);
    expect(screen.getByText(/Binary response \(unknown type\)/)).toBeInTheDocument();
  });
});
