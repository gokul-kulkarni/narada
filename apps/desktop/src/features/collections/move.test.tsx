import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newCollection, newRequest } from "@narada/core/factories";
import type { Collection, CollectionItem } from "@narada/core/model";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { MoveDialog } from "./MoveDialog";
import { CollectionsPanel } from "./CollectionsPanel";

const folder = (id: string, name: string, items: CollectionItem[] = []): CollectionItem => ({
  kind: "folder",
  id,
  name,
  auth: { type: "inherit" },
  items,
});
const order = newRequest({ id: "create", name: "Create order" });

function seed() {
  const shop: Collection = {
    ...newCollection("Shop"),
    id: "shop",
    items: [
      folder("orders", "orders"),
      folder("users", "users", [{ kind: "request", request: order }]),
    ],
  };
  const billing: Collection = {
    ...newCollection("Billing"),
    id: "billing",
    items: [folder("inv", "invoices")],
  };
  act(() => useWorkspaceStore.setState({ collections: [shop, billing], loaded: true }));
  act(() => useUiStore.getState().reveal(["shop", "billing"]));
}

/** A DataTransfer good enough for jsdom's drag events. */
function dataTransfer() {
  const data = new Map<string, string>();
  const images: Element[] = [];
  return {
    images,
    setDragImage: (element: Element) => images.push(element.cloneNode(true) as Element),
    effectAllowed: "",
    dropEffect: "",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
}

const tree = () => screen.getByRole("region", { name: "Collections" });
const names = (collectionId: string): unknown => {
  const walk = (items: readonly CollectionItem[]): unknown =>
    items.map((i) => (i.kind === "folder" ? { [i.name]: walk(i.items) } : i.request.name));
  return walk(
    useWorkspaceStore.getState().collections.find((c) => c.id === collectionId)?.items ?? [],
  );
};

describe("moving requests and folders", () => {
  beforeEach(() => {
    resetStores();
    seed();
    // A card from an earlier test may still wait for its one-frame removal.
    document.querySelectorAll("body > [data-drag-card]").forEach((card) => card.remove());
  });

  it("drags a request onto another folder", () => {
    render(<CollectionsPanel />);
    const transfer = dataTransfer();
    fireEvent.dragStart(within(tree()).getByRole("button", { name: /^GET\s*Create order$/ }), {
      dataTransfer: transfer,
    });
    const target = within(tree()).getByRole("button", { name: /^▾\s*orders$/ });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    expect(target.closest("[data-drop-target]")).toHaveAttribute("data-drop-target", "active");
    fireEvent.drop(target, { dataTransfer: transfer });
    expect(names("shop")).toEqual([{ orders: ["Create order"] }, { users: [] }]);
    expect(useUiStore.getState().notice).toBe('Moved "Create order" to Shop / orders.');
  });

  it("drags a folder into another collection, and an open tab follows its request", () => {
    const tabId = useTabsStore
      .getState()
      .openRequest(order, { collectionId: "shop", requestId: "create" });
    render(<CollectionsPanel />);
    const transfer = dataTransfer();
    fireEvent.dragStart(within(tree()).getByRole("button", { name: /^▾\s*users$/ }), {
      dataTransfer: transfer,
    });
    fireEvent.drop(within(tree()).getByRole("button", { name: /^▾\s*Billing$/ }), {
      dataTransfer: transfer,
    });
    expect(names("shop")).toEqual([{ orders: [] }]);
    expect(names("billing")).toEqual([{ invoices: [] }, { users: ["Create order"] }]);
    expect(useTabsStore.getState().tabs.find((t) => t.id === tabId)?.source?.collectionId).toBe(
      "billing",
    );
  });

  it("ignores drops that make no sense, and drags of other things", () => {
    render(<CollectionsPanel />);
    const transfer = dataTransfer();
    fireEvent.dragStart(within(tree()).getByRole("button", { name: /^▾\s*users$/ }), {
      dataTransfer: transfer,
    });
    fireEvent.drop(within(tree()).getByRole("button", { name: /^▾\s*users$/ }), {
      dataTransfer: transfer,
    });
    fireEvent.drop(within(tree()).getByRole("button", { name: /^▾\s*orders$/ }), {
      dataTransfer: dataTransfer(),
    });
    expect(names("shop")).toEqual([{ orders: [] }, { users: ["Create order"] }]);
  });

  it("moves with the Move to… dialog, offering only places it can go", () => {
    render(<MoveDialog collectionId="shop" itemId="users" onClose={() => {}} />);
    const destination = screen.getByLabelText("Move to") as HTMLSelectElement;
    const labels = [...destination.options].map((o) => o.textContent);
    // Not "Shop (top level)": "users" is already there.
    expect(labels).toEqual(["Shop / orders", "Billing (top level)", "Billing / invoices"]);
    fireEvent.change(destination, { target: { value: "billing::inv" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(names("billing")).toEqual([{ invoices: [{ users: ["Create order"] }] }]);
  });

  it("drags a card, dims the row it came from, and settles the row where it lands", () => {
    vi.useFakeTimers();
    render(<CollectionsPanel />);
    const transfer = dataTransfer();
    const row = within(tree()).getByRole("button", { name: /^GET\s*Create order$/ });
    fireEvent.dragStart(row, { dataTransfer: transfer, clientX: 40, clientY: 60 });

    const [card] = transfer.images;
    expect(card?.textContent).toBe("GETCreate order");
    expect(card?.getAttribute("data-drag-card")).toBe("request");
    act(() => vi.runAllTimers());
    expect(document.querySelector("body > [data-drag-card]")).toBeNull(); // only drawn for the snapshot
    expect(row.closest("[data-dragging]")).toHaveAttribute("data-dragging", "true");

    fireEvent.drop(within(tree()).getByRole("button", { name: /^▾\s*orders$/ }), {
      dataTransfer: transfer,
    });
    fireEvent.dragEnd(row);
    const moved = within(tree())
      .getByRole("button", { name: /^GET\s*Create order$/ })
      .closest("[data-settling]");
    expect(moved).toHaveAttribute("data-settling", "true");
    act(() => vi.advanceTimersByTime(1000));
    expect(moved).toHaveAttribute("data-settling", "false");
    vi.useRealTimers();
  });

  it("drags a folder as a folder card", () => {
    render(<CollectionsPanel />);
    const transfer = dataTransfer();
    fireEvent.dragStart(within(tree()).getByRole("button", { name: /^▾\s*users$/ }), {
      dataTransfer: transfer,
    });
    expect(transfer.images[0]?.getAttribute("data-drag-card")).toBe("folder");
    expect(transfer.images[0]?.textContent).toContain("users");
  });
});
