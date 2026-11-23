/**
 * Key combinations written like VS Code's: "mod+shift+t", "ctrl+tab", "f1".
 * `mod` is ⌘ on macOS and Ctrl elsewhere; `ctrl` is always the Control key.
 */
export type KeySpec = string;

export const isMac = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

interface Combo {
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

function parse(spec: KeySpec, mac: boolean): Combo {
  const parts = spec.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  return {
    meta: mods.has("cmd") || (mac && mods.has("mod")),
    ctrl: mods.has("ctrl") || (!mac && mods.has("mod")),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    key,
  };
}

/** Physical-key names for keys whose character changes with Shift or Option. */
const CODES: Readonly<Record<string, string>> = {
  "[": "BracketLeft",
  "]": "BracketRight",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
};

function keyMatches(token: string, e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (/^[a-z]$/.test(token)) {
    // By character, so layouts like AZERTY get the letter printed on the key;
    // by position only when the layout has no Latin letters (e.g. Cyrillic).
    return /^[a-z]$/.test(key) ? key === token : e.code === `Key${token.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(token)) return e.code === `Digit${token}` || key === token;
  if (CODES[token]) return e.code === CODES[token];
  const named: Readonly<Record<string, string>> = { left: "arrowleft", right: "arrowright" };
  return key === (named[token] ?? token);
}

export function matches(spec: KeySpec, e: KeyboardEvent, mac = isMac()): boolean {
  const combo = parse(spec, mac);
  return (
    combo.meta === e.metaKey &&
    combo.ctrl === e.ctrlKey &&
    combo.alt === e.altKey &&
    combo.shift === e.shiftKey &&
    keyMatches(combo.key, e)
  );
}

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  enter: "↵",
  tab: "⇥",
  left: "←",
  right: "→",
  pageup: "PgUp",
  pagedown: "PgDn",
};

/** How a combination is shown: "⌘⇧T" on macOS, "Ctrl+Shift+T" elsewhere. */
export function formatKeys(spec: KeySpec, mac = isMac()): string {
  const c = parse(spec, mac);
  const key = c.key.length === 1 ? c.key.toUpperCase() : c.key;
  if (mac) {
    const mods = `${c.ctrl ? "⌃" : ""}${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.meta ? "⌘" : ""}`;
    return mods + (MAC_SYMBOLS[c.key] ?? key.charAt(0).toUpperCase() + key.slice(1));
  }
  const names: Readonly<Record<string, string>> = {
    enter: "Enter",
    tab: "Tab",
    left: "Left",
    right: "Right",
    pageup: "PgUp",
    pagedown: "PgDn",
  };
  const mods = [c.ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift"].filter(Boolean);
  return [...mods, names[c.key] ?? key.charAt(0).toUpperCase() + key.slice(1)].join("+");
}
