import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { newRequest } from "@narada/core/factories";
import type { Collection } from "@narada/core/model";
import App from "../../App";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";

// jsdom is not macOS, so mod is Ctrl here.
const key = (init: KeyboardEventInit) => fireEvent.keyDown(window, { ctrlKey: true, ...init });

describe("keyboard shortcuts", () => {
  beforeEach(async () => {
    resetStores();
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
  });

  it("opens, switches, closes and reopens tabs", () => {
    key({ key: "t", code: "KeyT" });
    key({ key: "n", code: "KeyN" });
    const [a, b] = useTabsStore.getState().tabs.map((t) => t.id);
    expect(useTabsStore.getState().activeTabId).toBe(b);
    key({ key: "Tab" });
    expect(useTabsStore.getState().activeTabId).toBe(a);
    key({ key: "Tab", shiftKey: true });
    expect(useTabsStore.getState().activeTabId).toBe(b);
    key({ key: "1", code: "Digit1" });
    expect(useTabsStore.getState().activeTabId).toBe(a);
    key({ key: "w", code: "KeyW" });
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([b]);
    key({ key: "T", code: "KeyT", shiftKey: true });
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([b, a]);
  });

  it("goes to Settings and back, and hides the sidebar", () => {
    key({ key: ",", code: "Comma" });
    expect(useUiStore.getState().view.kind).toBe("settings");
    expect(screen.getByRole("region", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    // Like closing VS Code's settings editor.
    key({ key: "w", code: "KeyW" });
    expect(useUiStore.getState().view.kind).toBe("requests");
    key({ key: "b", code: "KeyB" });
    expect(screen.queryByRole("complementary", { name: "Workspace" })).toBeNull();
  });

  it("finds a saved request with the palette", async () => {
    const login = newRequest({ name: "Login", url: "https://api.dev/login" });
    useWorkspaceStore.setState({
      collections: [
        {
          id: "c1",
          name: "Shop",
          items: [{ kind: "request", request: login }],
        } as unknown as Collection,
      ],
    });
    key({ key: "p", code: "KeyP" });
    const search = await screen.findByRole("combobox", { name: "Search requests" });
    fireEvent.change(search, { target: { value: "log" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByRole("combobox", { name: /^Search/ })).toBeNull();
    expect(useTabsStore.getState().tabs.map((t) => t.request.name)).toEqual(["Login"]);
  });

  it("runs a command from the command palette and closes on Escape", async () => {
    key({ key: "P", code: "KeyP", shiftKey: true });
    const search = await screen.findByRole("combobox", { name: "Search commands" });
    expect(search).toHaveValue(">");
    fireEvent.change(search, { target: { value: ">new request" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    key({ key: "p", code: "KeyP" });
    fireEvent.keyDown(await screen.findByRole("combobox", { name: /^Search/ }), { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: /^Search/ })).toBeNull();
  });
});
