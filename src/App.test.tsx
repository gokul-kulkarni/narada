import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useTabsStore } from "./state/tabs-store";
import { resetStores } from "./test/reset-stores";

describe("App", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("opens a tab, sends a request and shows the response and history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"hello":"world"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://api.dev/users?page=2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));

    await waitFor(() => expect(screen.getByTestId("response-status")).toHaveTextContent("200"));
    expect(screen.getByLabelText("Response body")).toHaveValue('{\n  "hello": "world"\n}');
    expect(screen.getByRole("article", { name: "Latest delivery" })).toHaveTextContent(
      "GET /users?page=2→ no environment",
    );
    expect(screen.getByTestId("response-status")).toHaveTextContent(/^Delivered · 200 · \d+ ms/);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.dev/users?page=2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("edits query params, headers, body and auth", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://a.dev?x=1" } });
    expect(screen.getByLabelText("Key 1")).toHaveValue("x");
    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "2" } });
    expect(screen.getByLabelText("URL")).toHaveValue("https://a.dev?x=2");

    fireEvent.click(screen.getByRole("tab", { name: "Headers" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.change(screen.getByLabelText("Key 1"), { target: { value: "X-A" } });
    expect(screen.getByRole("tab", { name: "Headers (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.click(screen.getByLabelText("raw"));
    fireEvent.change(screen.getByLabelText("Raw body"), { target: { value: "{}" } });
    expect(useTabsStore.getState().tabs[0].request.body).toEqual({
      mode: "raw",
      raw: "{}",
      language: "json",
    });

    fireEvent.click(screen.getByRole("tab", { name: "Auth" }));
    fireEvent.change(screen.getByLabelText("Auth type"), { target: { value: "bearer" } });
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "{{token}}" } });
    expect(useTabsStore.getState().tabs[0].request.auth).toEqual({
      type: "bearer",
      token: "{{token}}",
    });
  });

  it("shows request errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Failed to fetch"));
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://down.dev" } });
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch"));
  });
});
