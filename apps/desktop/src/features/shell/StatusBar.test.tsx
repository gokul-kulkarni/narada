import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "../../state/ui-store";
import { resetStores } from "../../test/reset-stores";

const drive = vi.hoisted(() => ({ available: false, signedIn: false, sync: vi.fn() }));

vi.mock("../../lib/drive-api", () => ({
  driveAvailable: () => drive.available,
  getDriveStatus: () =>
    Promise.resolve({ configured: true, signedIn: drive.signedIn, clientId: "id" }),
}));
vi.mock("../settings/sync-now", () => ({ syncNow: drive.sync }));

const { StatusBar } = await import("./StatusBar");

describe("StatusBar", () => {
  beforeEach(() => {
    resetStores();
    drive.sync.mockReset();
  });

  it("says data stays in the browser outside the desktop app", () => {
    drive.available = false;
    render(<StatusBar />);
    expect(screen.getByText("Saved in this browser")).toBeInTheDocument();
    expect(screen.queryByText(/keychain/)).toBeNull();
  });

  it("offers to connect Drive when not signed in", async () => {
    drive.available = true;
    drive.signedIn = false;
    render(<StatusBar />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
    expect(useUiStore.getState().view).toEqual({ kind: "settings" });
    expect(screen.getByText(/keychain/)).toBeInTheDocument();
  });

  it("syncs on demand once signed in", async () => {
    drive.available = true;
    drive.signedIn = true;
    render(<StatusBar />);
    await waitFor(() => expect(screen.getByText(/Syncs with Google Drive/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(drive.sync).toHaveBeenCalled();
  });
});
