import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let desktop = true;
const invoke = vi.fn();
const open = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => desktop,
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => open(...args) }));

const { TlsSettings } = await import("./TlsSettings");

const saved = { acceptInvalidCerts: false, caCertificatesFile: null, problem: null };

describe("TlsSettings", () => {
  beforeEach(() => {
    desktop = true;
    invoke.mockReset();
    open.mockReset();
  });

  it("trusts a chosen CA file and saves both settings", async () => {
    invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "get_tls_settings") return saved;
      if (command === "set_tls_settings") return { ...args, problem: null };
      return null;
    });
    open.mockResolvedValue("/certs/company-ca.pem");
    render(<TlsSettings />);
    const check = await screen.findByRole("checkbox", { name: /Check HTTPS certificates/ });
    expect(check).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Choose file…" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Extra CA certificates file")).toHaveValue(
        "/certs/company-ca.pem",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_tls_settings", {
        acceptInvalidCerts: false,
        caCertificatesFile: "/certs/company-ca.pem",
      }),
    );
    expect(await screen.findByText("Saved. New requests use these settings.")).toBeInTheDocument();
  });

  it("turns certificate checks off with a warning, and shows what the app refused", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_tls_settings") return { ...saved, problem: "Could not read /old.pem" };
      if (command === "set_tls_settings") throw "Could not read the CA certificates file /x.pem";
      return null;
    });
    render(<TlsSettings />);
    expect(await screen.findByText(/Could not read \/old\.pem/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Check HTTPS certificates/ }));
    expect(screen.getByText(/accepts any certificate/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Extra CA certificates file"), {
      target: { value: "/x.pem" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Could not read the CA certificates file /x.pem"),
    ).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("set_tls_settings", {
      acceptInvalidCerts: true,
      caCertificatesFile: "/x.pem",
    });
  });

  it("explains that the browser decides about certificates", () => {
    desktop = false;
    render(<TlsSettings />);
    expect(screen.getByText(/the browser checks certificates/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});
