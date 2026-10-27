import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { newRequest } from "../../lib/factories";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function renderApp() {
  render(<App />);
  await screen.findByRole("heading", { name: "Free Postman" });
}

describe("scripts, runner, code generation and OAuth", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("runs test scripts, shows results and saves variables to the active environment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ token: "fresh" }));
    await renderApp();
    const env = useWorkspaceStore.getState().createEnvironment("Dev");
    useWorkspaceStore.getState().setActiveEnvironment(env.id);
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://a.dev/login" } });
    fireEvent.click(screen.getByRole("tab", { name: "Scripts" }));
    fireEvent.click(screen.getByRole("button", { name: "Status code is 200" }));
    fireEvent.click(screen.getByRole("button", { name: "Save token from body" }));
    expect((screen.getByLabelText("Test script") as HTMLTextAreaElement).value).toContain(
      'pm.environment.set("token"',
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    fireEvent.click(await screen.findByRole("tab", { name: "Tests (1/1)" }));
    expect(screen.getByRole("region", { name: "Response" })).toHaveTextContent(
      "PASSStatus code is 200",
    );
    await waitFor(() =>
      expect(useWorkspaceStore.getState().environments[0].variables).toMatchObject([
        { key: "token", value: "fresh" },
      ]),
    );
  });

  it("shows script errors next to the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}));
    await renderApp();
    useTabsStore
      .getState()
      .openRequest(newRequest({ url: "https://a.dev", testScript: "nope()" }), null);
    fireEvent.click(await screen.findByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Test script error: nope is not defined",
    );
    expect(screen.getByTestId("response-status")).toHaveTextContent("200");
  });

  it("generates code for the current request", async () => {
    await renderApp();
    useTabsStore
      .getState()
      .openRequest(newRequest({ method: "DELETE", url: "https://a.dev/items/1" }), null);
    fireEvent.click(await screen.findByRole("button", { name: "Code" }));
    expect(screen.getByLabelText("Generated code")).toHaveValue(
      "curl -X DELETE 'https://a.dev/items/1'",
    );
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "python" } });
    expect((screen.getByLabelText("Generated code") as HTMLTextAreaElement).value).toContain(
      "requests.request",
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs a collection with a data file and shows the summary", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => json({}, String(url).endsWith("/2") ? 500 : 200));
    await renderApp();
    const workspace = useWorkspaceStore.getState();
    const collection = workspace.createCollection("Users");
    await workspace.updateCollection(collection.id, (c) => ({
      ...c,
      testScript: 'pm.test("2xx", () => pm.response.to.be.ok);',
      items: [
        {
          kind: "request",
          request: newRequest({ name: "Get user", url: "https://a.dev/users/{{id}}" }),
        },
      ],
    }));
    fireEvent.click(screen.getByRole("button", { name: "Actions for Users" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Run collection" }));

    const file = new File(["id\n1\n2\n"], "ids.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Data file"), { target: { files: [file] } });
    expect(await screen.findByText("ids.csv: 2 row(s)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run 2 iteration(s)" }));

    await waitFor(() =>
      expect(screen.getByTestId("run-summary")).toHaveTextContent(
        "2 requests · 1 passed · 1 failed",
      ),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://a.dev/users/1",
      "https://a.dev/users/2",
    ]);
  });

  it("fetches an OAuth 2.0 client-credentials token into the request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ access_token: "tok123" }));
    await renderApp();
    useTabsStore.getState().openNew();
    fireEvent.click(await screen.findByRole("tab", { name: "Auth" }));
    fireEvent.change(screen.getByLabelText("Auth type"), { target: { value: "oauth2" } });
    fireEvent.change(screen.getByLabelText("Token URL"), {
      target: { value: "https://auth.dev/token" },
    });
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "id" } });
    fireEvent.click(screen.getByRole("button", { name: "Get new access token" }));
    await waitFor(() => expect(screen.getByLabelText("Access Token")).toHaveValue("tok123"));
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.dev/token");
  });

  it("edits collection scripts and runs folders from the tree", async () => {
    await renderApp();
    const workspace = useWorkspaceStore.getState();
    const collection = workspace.createCollection("C");
    await workspace.updateCollection(collection.id, (c) => ({
      ...c,
      items: [{ kind: "folder", id: "f", name: "Admin", auth: { type: "inherit" }, items: [] }],
    }));
    fireEvent.click(screen.getByRole("button", { name: "Actions for C" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Pre-request" }));
    fireEvent.change(screen.getByLabelText("Pre-request script"), {
      target: { value: "console.log(1)" },
    });
    expect(useWorkspaceStore.getState().collections[0].preRequestScript).toBe("console.log(1)");

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", { name: /^▸\s*C$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for Admin" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Run folder" }));
    expect(screen.getByRole("heading", { name: "Run “C / Admin”" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run 1 iteration(s)" })).toBeDisabled();
  });
});
