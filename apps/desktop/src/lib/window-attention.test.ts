import { afterEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/api/core", () => tauri);
const win = vi.hoisted(() => ({
  unminimize: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  setFocus: vi.fn(async () => {}),
  requestUserAttention: vi.fn(async () => {}),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => win,
  UserAttentionType: { Critical: 1, Informational: 2 },
}));

const { drawAttention } = await import("./window-attention");

afterEach(() => vi.clearAllMocks());

describe("drawAttention", () => {
  it("brings the window to the front so the first click reaches the dialog", async () => {
    await drawAttention();
    expect(win.unminimize).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.setFocus).toHaveBeenCalled();
    expect(win.requestUserAttention).toHaveBeenCalledWith(2);
  });

  it("does nothing in the browser build, and never throws", async () => {
    tauri.isTauri.mockReturnValueOnce(false);
    await drawAttention();
    expect(win.setFocus).not.toHaveBeenCalled();
    win.setFocus.mockRejectedValueOnce(new Error("not allowed"));
    await expect(drawAttention()).resolves.toBeUndefined();
  });
});
