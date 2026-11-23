import { beforeEach, describe, expect, it, vi } from "vitest";
import { setUpdater, type FoundUpdate, type UpdaterPort } from "../lib/updater";
import { loadAutoCheck, saveAutoCheck, useUpdateStore } from "./update-store";

function fakeUpdater(found: FoundUpdate | null | Error): UpdaterPort {
  return {
    available: true,
    currentVersion: async () => "0.2.2",
    check: async () => {
      if (found instanceof Error) throw found;
      return found;
    },
  };
}

const update = (install: FoundUpdate["install"] = async () => undefined): FoundUpdate => ({
  version: "0.3.0",
  notes: "Faster imports",
  install,
});

describe("update store", () => {
  beforeEach(() => {
    localStorage.clear();
    useUpdateStore.setState({ status: { kind: "idle" }, dismissed: false });
  });

  it("finds a newer version and installs it, reporting download progress", async () => {
    const seen: number[] = [];
    const install = vi.fn<FoundUpdate["install"]>(async (onProgress) => {
      onProgress(25, 100);
      seen.push(percentOf());
      onProgress(100, 100);
      seen.push(percentOf());
    });
    setUpdater(fakeUpdater(update(install)));

    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState().status).toEqual({
      kind: "available",
      version: "0.3.0",
      notes: "Faster imports",
    });
    await useUpdateStore.getState().install();
    expect(install).toHaveBeenCalledOnce();
    expect(seen).toEqual([25, 100]);
  });

  it("says when Narada is up to date", async () => {
    setUpdater(fakeUpdater(null));
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState().status).toEqual({ kind: "upToDate" });
  });

  it("shows a failed manual check, but keeps a failed startup check quiet", async () => {
    setUpdater(fakeUpdater(new Error("offline")));
    await useUpdateStore.getState().check({ quiet: true });
    expect(useUpdateStore.getState().status).toEqual({ kind: "idle" });
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState().status).toEqual({ kind: "failed", error: "offline" });
  });

  it("keeps the offer when installing fails, so it can be retried", async () => {
    setUpdater(fakeUpdater(update(async () => Promise.reject(new Error("disk full")))));
    await useUpdateStore.getState().check();
    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState().status).toEqual({
      kind: "failed",
      error: "Could not install Narada 0.3.0: disk full",
    });
  });

  it("checks at startup only when automatic checks are on", async () => {
    const check = vi.fn(async () => null);
    setUpdater({ available: true, currentVersion: async () => "0.2.2", check });
    saveAutoCheck(false);
    await useUpdateStore.getState().checkOnStartup();
    expect(check).not.toHaveBeenCalled();
    saveAutoCheck(true);
    await useUpdateStore.getState().checkOnStartup();
    expect(check).toHaveBeenCalledOnce();
  });

  it("never checks in the browser build", async () => {
    const check = vi.fn(async () => null);
    setUpdater({ available: false, currentVersion: async () => "", check });
    await useUpdateStore.getState().checkOnStartup();
    await useUpdateStore.getState().check();
    expect(check).not.toHaveBeenCalled();
  });

  it("turns automatic checks on by default", () => {
    expect(loadAutoCheck()).toBe(true);
  });
});

function percentOf(): number {
  const status = useUpdateStore.getState().status;
  return status.kind === "downloading" ? (status.percent ?? -1) : -1;
}
