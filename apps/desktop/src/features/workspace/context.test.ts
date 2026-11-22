import { beforeEach, describe, expect, it } from "vitest";
import { newKeyValue } from "../../lib/factories";
import type { VariableScopes } from "../../lib/variables";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { applyScopes, mergeRows } from "./context";

const empty: VariableScopes = { global: {}, collection: {}, environment: {}, data: {}, local: {} };

describe("mergeRows", () => {
  it("updates, removes and adds enabled rows but keeps disabled ones", () => {
    const rows = [
      newKeyValue("a", "1"),
      newKeyValue("b", "2"),
      { ...newKeyValue("c", "3"), enabled: false },
    ];
    const merged = mergeRows(rows, { a: "9", d: "4" }, (r) => r);
    expect(merged.map((r) => [r.key, r.value, r.enabled])).toEqual([
      ["a", "9", true],
      ["c", "3", false],
      ["d", "4", true],
    ]);
    expect(merged[0].id).toBe(rows[0].id);
  });
});

describe("applyScopes", () => {
  beforeEach(() => resetStores());

  it("writes changed scopes back to the workspace", async () => {
    const workspace = useWorkspaceStore.getState();
    const env = workspace.createEnvironment("E");
    workspace.setActiveEnvironment(env.id);
    const collection = workspace.createCollection("C");
    await applyScopes(collection.id, empty, {
      ...empty,
      environment: { t: "1" },
      collection: { c: "2" },
      global: { g: "3" },
    });
    const state = useWorkspaceStore.getState();
    expect(state.environments[0].variables).toMatchObject([
      { key: "t", value: "1", secret: false },
    ]);
    expect(state.collections[0].variables).toMatchObject([{ key: "c", value: "2" }]);
    expect(state.globals).toMatchObject([{ key: "g", value: "3" }]);
  });

  it("does nothing when nothing changed", async () => {
    await applyScopes(null, empty, empty);
    expect(useWorkspaceStore.getState().globals).toEqual([]);
  });
});
