import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POSTMAN_API_KEY_SECRET, POSTMAN_API_URL } from "../../lib/postman-api";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "../../lib/postman/fixtures";
import { getServices } from "../../state/services";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { ImportDialog } from "./ImportDialog";

const ROUTES: Record<string, unknown> = {
  "/workspaces": {
    workspaces: [
      { id: "w1", name: "Team", type: "team" },
      { id: "w2", name: "Empty", type: "personal" },
    ],
  },
  "/collections?workspace=w1": { collections: [{ uid: "u-c1", name: "Pet Store" }] },
  "/environments?workspace=w1": { environments: [{ uid: "u-e1", name: "Staging" }] },
  "/collections?workspace=w2": { collections: [] },
  "/environments?workspace=w2": { environments: [] },
  "/collections/u-c1": { collection: POSTMAN_COLLECTION },
  "/environments/u-e1": { environment: POSTMAN_ENVIRONMENT },
};

function mockPostman(routes: Record<string, unknown> = ROUTES) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input).slice(POSTMAN_API_URL.length);
    const headers = init?.headers as [string, string][];
    if (!headers.some(([k, v]) => k === "X-Api-Key" && v === "PMAK-good"))
      return new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
    return path in routes
      ? new Response(JSON.stringify(routes[path]), { status: 200 })
      : new Response("{}", { status: 404 });
  });
}

const openAccountTab = () => {
  const onClose = vi.fn();
  render(<ImportDialog onClose={onClose} />);
  fireEvent.click(screen.getByRole("tab", { name: "Postman account" }));
  return onClose;
};

const connectWith = (key: string) => {
  fireEvent.change(screen.getByLabelText("Postman API key"), { target: { value: key } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
};

describe("ImportDialog — Postman account", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("lists a workspace and imports the selected collection and environment", async () => {
    mockPostman();
    const onClose = openAccountTab();
    connectWith("PMAK-good");

    fireEvent.click(await screen.findByRole("checkbox", { name: "Pet Store" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Staging" }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { collections, environments } = useWorkspaceStore.getState();
    expect(collections.map((c) => c.name)).toEqual(["Pet Store"]);
    expect(environments.map((e) => e.name)).toEqual([POSTMAN_ENVIRONMENT.name]);
    expect(useUiStore.getState().notice).toBe("Imported 2 item(s) from Postman.");
    expect(await getServices().secrets.get(POSTMAN_API_KEY_SECRET)).toBe("PMAK-good");
  });

  it("switches workspaces and shows empty lists", async () => {
    mockPostman();
    openAccountTab();
    connectWith("PMAK-good");
    await screen.findByRole("checkbox", { name: "Pet Store" });
    fireEvent.change(screen.getByLabelText("Postman workspace"), { target: { value: "w2" } });
    expect(await screen.findAllByText("None in this workspace.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Import selected" })).toBeDisabled();
  });

  it("shows a rejected key and does not remember it", async () => {
    mockPostman();
    openAccountTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Remember" }));
    connectWith("PMAK-bad");
    expect(await screen.findByRole("alert")).toHaveTextContent(/API key was rejected/);
    expect(await getServices().secrets.get(POSTMAN_API_KEY_SECRET)).toBeNull();
  });

  it("prefills a remembered key and forgets it when unticked", async () => {
    mockPostman();
    await getServices().secrets.set(POSTMAN_API_KEY_SECRET, "PMAK-good");
    openAccountTab();
    await waitFor(() => expect(screen.getByLabelText("Postman API key")).toHaveValue("PMAK-good"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Remember" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("checkbox", { name: "Pet Store" });
    expect(await getServices().secrets.get(POSTMAN_API_KEY_SECRET)).toBeNull();
  });

  it("reports items that fail to download", async () => {
    mockPostman({ ...ROUTES, "/environments/u-e1": { nope: 1 } });
    const onClose = openAccountTab();
    connectWith("PMAK-good");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Pet Store" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Staging" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pet Store" })); // untick again
    fireEvent.click(screen.getByRole("button", { name: "Import selected" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Nothing was imported\. Staging: Unexpected response/,
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ImportDialog — files", () => {
  beforeEach(() => resetStores());

  const pick = (files: File[]) =>
    fireEvent.change(screen.getByLabelText("Import file"), { target: { files } });
  const json = (name: string, value: unknown) => new File([JSON.stringify(value)], name);

  it("previews chosen files, then imports the valid ones", async () => {
    const onClose = vi.fn();
    render(<ImportDialog onClose={onClose} />);
    pick([
      json("pets.postman_collection.json", POSTMAN_COLLECTION),
      json("staging.postman_environment.json", POSTMAN_ENVIRONMENT),
      json("junk.json", { a: 1 }),
    ]);
    const list = await screen.findByRole("list", { name: "Ready to import" });
    expect(list).toHaveTextContent("Pet Store");
    expect(list).toHaveTextContent(
      "Collection · 1 folder · 4 requests · pets.postman_collection.json",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Unrecognised JSON/);
    expect(useWorkspaceStore.getState().collections).toHaveLength(0); // nothing until confirmed

    fireEvent.click(screen.getByRole("button", { name: "Remove junk.json" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 items" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useUiStore.getState().notice).toBe("Imported 2 of 2 items.");
    expect(useWorkspaceStore.getState().collections).toHaveLength(1);
    expect(useWorkspaceStore.getState().environments).toHaveLength(1);
  });

  it("reveals a single imported collection", async () => {
    render(<ImportDialog onClose={vi.fn()} />);
    pick([json("pets.json", POSTMAN_COLLECTION)]);
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    await waitFor(() => expect(useUiStore.getState().revealed.size).toBe(1));
    expect(useUiStore.getState().notice).toBe('Imported collection "Pet Store".');
  });

  it("previews files dropped on the drop zone or handed in by the window", async () => {
    render(
      <ImportDialog initialFiles={[json("env.json", POSTMAN_ENVIRONMENT)]} onClose={vi.fn()} />,
    );
    fireEvent.drop(screen.getByTestId("drop-zone"), {
      dataTransfer: { files: [json("pets.json", POSTMAN_COLLECTION)], types: ["Files"] },
    });
    const list = await screen.findByRole("list", { name: "Ready to import" });
    await waitFor(() => expect(list.querySelectorAll("li")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Import 2 items" })).toBeEnabled();
  });

  it("can't import when nothing is valid", async () => {
    render(<ImportDialog onClose={vi.fn()} />);
    pick([json("a.json", {}), json("old.json", { name: "Old", requests: [] })]);
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText(/choose Collection v2\.1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });
});
