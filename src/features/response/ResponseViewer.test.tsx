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

  describe("streams", () => {
    const chunk = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
    const body = chunk("Keep ") + chunk("going.") + "data: [DONE]\n\n";
    const stream = response({
      status: 200,
      headers: [["content-type", "text/event-stream"]],
      body,
      timeline: [
        { atMs: 120, end: chunk("Keep ").length },
        { atMs: 300, end: body.length },
      ],
    });

    it("opens LLM streams on the joined text", () => {
      render(<ResponseViewer response={stream} />);
      expect(screen.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByLabelText("Streamed text")).toHaveTextContent("Keep going.");
      expect(screen.getByText(/First text after 120 ms · 2 pieces/)).toBeInTheDocument();
    });

    it("lists each event with when it arrived", () => {
      render(<ResponseViewer response={stream} />);
      fireEvent.click(screen.getByRole("tab", { name: "Events (3)" }));
      const events = screen.getAllByRole("listitem");
      expect(events[0]).toHaveTextContent("+120 ms");
      expect(events[2]).toHaveTextContent("+300 ms[DONE]");
    });

    it("opens other streams on their events", () => {
      render(
        <ResponseViewer
          live
          response={response({ headers: [["content-type", "application/x-ndjson"]], body: "" })}
        />,
      );
      expect(screen.queryByRole("tab", { name: "Text" })).not.toBeInTheDocument();
      expect(screen.getByText("No complete events yet.")).toBeInTheDocument();
    });
  });
});
