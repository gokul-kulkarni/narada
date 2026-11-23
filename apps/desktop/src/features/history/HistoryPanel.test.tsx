import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { newRequest } from "@narada/core/factories";
import type { HistoryEntry } from "@narada/core/model";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";
import { asHttp } from "../../test/http";
import { StatusBar } from "../shell/StatusBar";
import { HistoryPanel } from "./HistoryPanel";

const pets = { ...newRequest(), id: "req-pets", url: "https://api.dev/pets" };
const users = { ...newRequest(), id: "req-users", url: "https://api.dev/users" };

const entry = (id: string, request: typeof pets, status: number | null): HistoryEntry => ({
  id,
  sentAt: new Date().toISOString(),
  request,
  status,
  timeMs: status === null ? null : 10,
});

describe("HistoryPanel", () => {
  beforeEach(() => {
    resetStores();
    useHistoryStore.setState({
      entries: [entry("1", pets, 404), entry("2", users, 200), entry("3", pets, null)],
    });
    useTabsStore.getState().openRequest(pets, null);
  });

  const renderBar = () =>
    render(
      <>
        <HistoryPanel />
        <StatusBar />
      </>,
    );

  it("opens from the status bar and shows the open request's deliveries", () => {
    renderBar();
    expect(screen.queryByRole("region", { name: "History" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));

    const list = screen.getByRole("list", { name: "Sent requests" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("Returned · 404 · 10 ms");

    fireEvent.click(screen.getByRole("tab", { name: "All (3)" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Close history" }));
    expect(screen.queryByRole("region", { name: "History" })).toBeNull();
  });

  it("opens an earlier delivery in a new tab", () => {
    useUiStore.setState({ historyOpen: true });
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: /Not delivered/ }));
    const opened = useTabsStore.getState().tabs.at(-1)!;
    expect(asHttp(opened.request).url).toBe("https://api.dev/pets");
    expect(opened.request.id).not.toBe("req-pets");
    expect(useTabsStore.getState().activeTabId).toBe(opened.id);
  });

  it("shows everything when no request is on screen", () => {
    useUiStore.setState({ historyOpen: true, view: { kind: "settings" } });
    renderBar();
    expect(screen.queryByRole("tab", { name: /This request/ })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
