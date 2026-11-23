import { describe, expect, it } from "vitest";
import { formatKeys, matches } from "./keys";

const press = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("keys", () => {
  it("reads mod as ⌘ on macOS and Ctrl elsewhere", () => {
    expect(matches("mod+s", press({ key: "s", code: "KeyS", metaKey: true }), true)).toBe(true);
    expect(matches("mod+s", press({ key: "s", code: "KeyS", ctrlKey: true }), true)).toBe(false);
    expect(matches("mod+s", press({ key: "s", code: "KeyS", ctrlKey: true }), false)).toBe(true);
  });

  it("needs exactly the listed modifiers", () => {
    const shiftT = press({ key: "T", code: "KeyT", metaKey: true, shiftKey: true });
    expect(matches("mod+t", shiftT, true)).toBe(false);
    expect(matches("mod+shift+t", shiftT, true)).toBe(true);
    expect(matches("ctrl+tab", press({ key: "Tab", ctrlKey: true }), true)).toBe(true);
  });

  it("matches letters by character and symbols by key position", () => {
    // AZERTY: the key printed W is where QWERTY has Z.
    expect(matches("mod+w", press({ key: "w", code: "KeyZ", metaKey: true }), true)).toBe(true);
    expect(matches("mod+w", press({ key: "z", code: "KeyW", metaKey: true }), true)).toBe(false);
    // Cyrillic layout: no Latin letter, so the position decides.
    expect(matches("mod+p", press({ key: "з", code: "KeyP", metaKey: true }), true)).toBe(true);
    // ⌘⇧] reports "}" as the key.
    const next = press({ key: "}", code: "BracketRight", metaKey: true, shiftKey: true });
    expect(matches("mod+shift+]", next, true)).toBe(true);
    expect(matches("mod+1", press({ key: "1", code: "Digit1", metaKey: true }), true)).toBe(true);
    expect(matches("mod+enter", press({ key: "Enter", metaKey: true }), true)).toBe(true);
    expect(
      matches("mod+alt+right", press({ key: "ArrowRight", metaKey: true, altKey: true }), true),
    ).toBe(true);
  });

  it("shows keys the way each platform writes them", () => {
    expect(formatKeys("mod+shift+t", true)).toBe("⇧⌘T");
    expect(formatKeys("mod+shift+t", false)).toBe("Ctrl+Shift+T");
    expect(formatKeys("ctrl+tab", true)).toBe("⌃⇥");
    expect(formatKeys("mod+enter", true)).toBe("⌘↵");
    expect(formatKeys("mod+,", false)).toBe("Ctrl+,");
    expect(formatKeys("f1", false)).toBe("F1");
  });
});
