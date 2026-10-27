import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStores } from "../../test/reset-stores";
import { useUiStore } from "../../state/ui-store";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { DriveSettings } = await import("./DriveSettings");
const { syncNow } = await import("./sync-now");

const report = {
  uploaded: ["collections/a.json"],
  downloaded: [],
  deletedLocal: [],
  deletedRemote: [],
  conflicts: [],
};

describe("DriveSettings (desktop)", () => {
  beforeEach(() => {
    resetStores();
    invoke.mockReset();
  });

  it("configures the client, signs in and syncs", async () => {
    let signedIn = false;
    invoke.mockImplementation(async (command: string) => {
      if (command === "drive_status")
        return { configured: true, signedIn, clientId: "x.apps.googleusercontent.com" };
      if (command === "drive_sign_in") signedIn = true;
      if (command === "drive_sync") return report;
      if (command === "list_documents") return [];
      return null;
    });
    render(<DriveSettings />);
    expect(await screen.findByText("Not signed in")).toBeInTheDocument();
    expect(screen.getByLabelText("OAuth client ID")).toHaveValue("x.apps.googleusercontent.com");

    fireEvent.change(screen.getByLabelText("OAuth client secret"), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("drive_configure", {
        clientId: "x.apps.googleusercontent.com",
        clientSecret: "s",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    expect(await screen.findByText("✅ Signed in")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() =>
      expect(useUiStore.getState().notice).toBe("Synced with Google Drive: 1 uploaded."),
    );
  });

  it("shows errors from the backend", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "drive_status") return { configured: true, signedIn: false, clientId: null };
      if (command === "drive_sign_in") throw "Timed out waiting for Google sign-in";
      return null;
    });
    render(<DriveSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Timed out waiting for Google sign-in",
    );
  });

  it("reports sync failures as a notice", async () => {
    invoke.mockRejectedValue("Not signed in to Google Drive");
    await syncNow();
    expect(useUiStore.getState().notice).toBe("Sync failed: Not signed in to Google Drive");
  });
});
