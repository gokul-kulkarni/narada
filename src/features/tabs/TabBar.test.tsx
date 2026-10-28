import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { newRequest } from "../../lib/factories";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";
import { HistoryList } from "../history/HistoryList";
import { TabBar } from "./TabBar";
import { asHttp } from "../../test/http";

describe("TabBar and HistoryList", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: null });
    useHistoryStore.setState({ entries: [] });
  });

  it("switches and closes tabs", () => {
    const a = useTabsStore.getState().openRequest(newRequest({ name: "A" }), null);
    useTabsStore.getState().openRequest(newRequest({ name: "B" }), null);
    render(<TabBar />);
    fireEvent.click(screen.getByRole("tab", { name: /A/ }));
    expect(useTabsStore.getState().activeTabId).toBe(a);
    fireEvent.click(screen.getByRole("button", { name: "Close A" }));
    expect(useTabsStore.getState().tabs.map((t) => t.request.name)).toEqual(["B"]);
  });

  it("reopens history entries in a new tab and clears history", () => {
    useHistoryStore.getState().add({
      id: "h1",
      sentAt: "2026-01-01T00:00:00Z",
      request: newRequest({ url: "https://a.dev" }),
      status: 500,
      timeMs: 3,
    });
    render(<HistoryList />);
    fireEvent.click(screen.getByRole("button", { name: /https:\/\/a.dev/ }));
    expect(asHttp(useTabsStore.getState().tabs[0].request).url).toBe("https://a.dev");
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.getByText("No requests sent yet.")).toBeInTheDocument();
  });

  it("caps history size and replaces entries", () => {
    const entry = { id: "x", sentAt: "", request: newRequest(), status: 200, timeMs: 1 };
    useHistoryStore
      .getState()
      .replaceAll(Array.from({ length: 300 }, (_, i) => ({ ...entry, id: `${i}` })));
    expect(useHistoryStore.getState().entries).toHaveLength(200);
  });
});
