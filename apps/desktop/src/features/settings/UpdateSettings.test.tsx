import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setUpdater, type FoundUpdate } from "../../lib/updater";
import { loadAutoCheck, useUpdateStore } from "../../state/update-store";
import { UpdateNotice } from "../shell/UpdateNotice";
import { UpdateSettings } from "./UpdateSettings";

let next: FoundUpdate | null = null;
const install = vi.fn<FoundUpdate["install"]>();

describe("updates", () => {
  beforeEach(() => {
    localStorage.clear();
    next = null;
    install.mockReset();
    useUpdateStore.setState({ status: { kind: "idle" }, dismissed: false });
    setUpdater({ available: true, currentVersion: async () => "0.2.2", check: async () => next });
  });

  it("shows the version, checks on request and turns automatic checks off", async () => {
    render(<UpdateSettings />);
    expect(await screen.findByText("Narada 0.2.2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("You have the latest version.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Check for updates when Narada starts/ }));
    expect(loadAutoCheck()).toBe(false);
  });

  it("offers a new version in the status bar and in Settings, and installs it", async () => {
    next = { version: "0.3.0", notes: "Faster imports", install };
    install.mockImplementation(async (onProgress) => onProgress(50, 100));
    render(
      <>
        <UpdateSettings />
        <UpdateNotice />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Faster imports")).toBeInTheDocument();
    // In Settings and in the status bar.
    expect(screen.getAllByText("Narada 0.3.0 is available")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Update and restart" })[0]);
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(screen.getAllByText("Downloading Narada 0.3.0… 50%").length).toBeGreaterThan(0);
  });

  it("lets the person put the offer off for this session", async () => {
    next = { version: "0.3.0", notes: "", install };
    await act(() => useUpdateStore.getState().check());
    render(<UpdateNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText("Narada 0.3.0 is available")).toBeNull();
  });

  it("explains a failed check", async () => {
    setUpdater({
      available: true,
      currentVersion: async () => "0.2.2",
      check: async () => Promise.reject(new Error("You are offline")),
    });
    render(<UpdateSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You are offline");
  });

  it("says updates come with the desktop app in the browser build", () => {
    setUpdater({ available: false, currentVersion: async () => "", check: async () => null });
    render(
      <>
        <UpdateSettings />
        <UpdateNotice />
      </>,
    );
    expect(screen.getByText(/desktop app updates itself/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
  });
});
