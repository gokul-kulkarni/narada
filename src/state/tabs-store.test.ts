import { beforeEach, describe, expect, it } from "vitest";
import { newRequest } from "../lib/factories";
import { selectActiveTab, useTabsStore } from "./tabs-store";
import { asHttp } from "../test/http";

describe("tabs store", () => {
  beforeEach(() => useTabsStore.setState({ tabs: [], activeTabId: null }));

  it("opens new tabs and activates them", () => {
    const id = useTabsStore.getState().openNew();
    expect(selectActiveTab(useTabsStore.getState())?.id).toBe(id);
  });

  it("reuses the tab of a request that is already open", () => {
    const request = newRequest();
    const source = { collectionId: "c", requestId: request.id };
    const first = useTabsStore.getState().openRequest(request, source);
    useTabsStore.getState().openNew();
    expect(useTabsStore.getState().openRequest(request, source)).toBe(first);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useTabsStore.getState().activeTabId).toBe(first);
  });

  it("updates requests immutably and marks the tab dirty", () => {
    const id = useTabsStore.getState().openNew();
    const before = useTabsStore.getState().tabs[0];
    useTabsStore.getState().updateRequest(id, (r) => ({ ...r, url: "https://a.dev" }));
    const after = useTabsStore.getState().tabs[0];
    expect(asHttp(after.request).url).toBe("https://a.dev");
    expect(after.dirty).toBe(true);
    expect(asHttp(before.request).url).toBe("");
  });

  it("activates a neighbour when the active tab closes", () => {
    const a = useTabsStore.getState().openNew();
    const b = useTabsStore.getState().openNew();
    useTabsStore.getState().close(b);
    expect(useTabsStore.getState().activeTabId).toBe(a);
    useTabsStore.getState().close(a);
    expect(useTabsStore.getState().activeTabId).toBeNull();
  });

  it("keeps the active tab when closing another one", () => {
    const a = useTabsStore.getState().openNew();
    const b = useTabsStore.getState().openNew();
    useTabsStore.getState().activate(a);
    useTabsStore.getState().close(b);
    expect(useTabsStore.getState().activeTabId).toBe(a);
  });

  it("patches tab fields", () => {
    const id = useTabsStore.getState().openNew();
    useTabsStore.getState().patchTab(id, { loading: true });
    expect(useTabsStore.getState().tabs[0].loading).toBe(true);
  });
});
