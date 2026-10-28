import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "../../lib/postman/fixtures";
import type { DocumentStore } from "../../lib/storage/document-store";
import { useTabsStore } from "../../state/tabs-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";

let documents: DocumentStore;

const sidebar = () => screen.getByRole("complementary", { name: "Workspace" });
const menuItem = (owner: string, label: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${owner}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
};
const importText = async (text: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
  fireEvent.change(screen.getByLabelText("Import text"), { target: { value: text } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Import" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

describe("collections and environments", () => {
  beforeEach(() => {
    documents = resetStores();
    vi.restoreAllMocks();
  });

  it("imports a Postman collection and environment, then sends with variables and request auth", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    await importText(JSON.stringify(POSTMAN_COLLECTION));
    expect(screen.getByRole("status")).toHaveTextContent('Imported collection "Pet Store"');
    await importText(JSON.stringify(POSTMAN_ENVIRONMENT));

    fireEvent.change(screen.getByLabelText("Active environment"), {
      target: { value: POSTMAN_ENVIRONMENT.id },
    });
    expect(within(sidebar()).getByRole("button", { name: /^▾\s*Pet Store$/ })).toBeInTheDocument(); // imported collections open expanded
    fireEvent.click(within(sidebar()).getByRole("button", { name: /^POST\s*Create pet$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.dev/pets"); // environment overrides the collection variable
    expect(init.headers).toContainEqual(["Content-Type", "application/json"]);
    expect(init.headers).toContainEqual(["X-Api-Key", "{{apiKey}}"]); // undefined vars are left as-is
    expect(await documents.list("collections")).toHaveLength(1);
  });

  it("creates a collection, adds and saves a request", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(
      within(screen.getByRole("region", { name: "Collections" })).getByRole("button", {
        name: "+ New",
      }),
    );
    menuItem("New Collection", "Add request");
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://a.dev/x" } });
    expect(screen.getByLabelText("unsaved")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(screen.queryByLabelText("unsaved")).toBeNull());
    const [doc] = await documents.list("collections");
    expect(JSON.parse(doc.content).item[0].request.url).toBe("https://a.dev/x");
  });

  it("saves an unsaved tab through the save dialog into a new collection", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = screen.getByRole("dialog", { name: "Save request" });
    fireEvent.change(within(dialog).getByLabelText("Request name to save"), {
      target: { value: "Ping" },
    });
    fireEvent.change(within(dialog).getByLabelText("New collection name"), {
      target: { value: "Ops" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useWorkspaceStore.getState().collections[0]?.name).toBe("Ops"));
    expect(useTabsStore.getState().tabs[0]).toMatchObject({
      dirty: false,
      request: { name: "Ping" },
    });
  });

  it("saves into a chosen folder of an existing collection", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    await importText(JSON.stringify(POSTMAN_COLLECTION));
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = screen.getByRole("dialog", { name: "Save request" });
    fireEvent.change(within(dialog).getByLabelText("Folder"), {
      target: {
        value:
          useWorkspaceStore.getState().collections[0].items[0].kind === "folder"
            ? (useWorkspaceStore.getState().collections[0].items[0] as { id: string }).id
            : "",
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const folder = useWorkspaceStore.getState().collections[0].items[0];
    expect(folder.kind === "folder" && folder.items).toHaveLength(2);
  });

  it("imports curl into a new tab and reports bad input", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    await importText("curl -X POST https://a.dev/items -d '{\"a\":1}'");
    expect(screen.getByLabelText("URL")).toHaveValue("https://a.dev/items");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(screen.getByLabelText("Import text"), { target: { value: "nonsense" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/curl command/);
  });

  it("edits environments with secrets kept out of the file", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    fireEvent.click(
      within(screen.getByRole("region", { name: "Environments" })).getByRole("button", {
        name: "+ New",
      }),
    );
    fireEvent.change(screen.getByLabelText("Environment name"), { target: { value: "Prod" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.change(screen.getByLabelText("Key 1"), { target: { value: "token" } });
    fireEvent.click(screen.getByLabelText("secret"));
    fireEvent.change(screen.getByLabelText("Value 1"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Set active" }));
    expect(screen.getByLabelText("Active environment")).toHaveDisplayValue("Prod");
    await waitFor(async () => {
      const [doc] = await documents.list("environments");
      expect(JSON.parse(doc.content).values[0]).toMatchObject({
        key: "token",
        type: "secret",
        value: "",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await documents.list("environments")).toEqual([]));
  });

  it("renames, duplicates and deletes tree items", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    await importText(JSON.stringify(POSTMAN_COLLECTION));
    expect(within(sidebar()).getByRole("button", { name: /^▾\s*Pet Store$/ })).toBeInTheDocument(); // imported collections open expanded
    menuItem("Login", "Rename");
    const input = screen.getByLabelText("Rename");
    fireEvent.change(input, { target: { value: "Sign in" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(sidebar()).getByRole("button", { name: /^POST\s*Sign in$/ })).toBeInTheDocument();
    menuItem("Sign in", "Duplicate");
    expect(
      within(sidebar()).getByRole("button", { name: /^POST\s*Sign in copy$/ }),
    ).toBeInTheDocument();
    menuItem("Pets", "Delete");
    expect(screen.getByRole("menuitem", { name: "Confirm delete?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Confirm delete?" }));
    expect(within(sidebar()).queryByRole("button", { name: /^GET\s*List pets$/ })).toBeNull();
  });

  it("edits collection settings and globals, and loads saved history on start", async () => {
    await documents.writeLocal(
      "history.json",
      JSON.stringify([
        {
          id: "h",
          sentAt: "",
          request: { method: "GET", url: "https://old.dev", name: "old" },
          status: 200,
          timeMs: 1,
        },
      ]),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    expect(await screen.findByText("https://old.dev")).toBeInTheDocument();
    await importText(JSON.stringify(POSTMAN_COLLECTION));
    menuItem("Pet Store", "Settings");
    fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: "Pets API" } });
    expect(useWorkspaceStore.getState().collections[0].name).toBe("Pets API");
    fireEvent.click(screen.getByRole("button", { name: /Globals/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    fireEvent.change(screen.getByLabelText("Key 1"), { target: { value: "g" } });
    await waitFor(async () => expect(await documents.readLocal("globals.json")).toContain('"g"'));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByTestId("storage-dir")).toHaveTextContent("Browser storage");
    act(() => void useTabsStore.getState().openNew());
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });
});
