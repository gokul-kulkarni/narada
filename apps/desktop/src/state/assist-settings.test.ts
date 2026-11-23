import { describe, expect, it } from "vitest";
import type { DetectedAgent } from "../lib/assist/client";
import { DEFAULT_SETTINGS, preferredAgent } from "./assist-settings";

const agent = (id: string): DetectedAgent => ({ id, name: id, path: `/bin/${id}`, version: "1" });

describe("preferredAgent", () => {
  it("is the chosen agent when it is installed, else the first one found", () => {
    const both = [agent("claude"), agent("codex")];
    expect(preferredAgent(both, { ...DEFAULT_SETTINGS, defaultAgent: "codex" })?.id).toBe("codex");
    expect(preferredAgent(both, DEFAULT_SETTINGS)?.id).toBe("claude");
    expect(
      preferredAgent([agent("claude")], { ...DEFAULT_SETTINGS, defaultAgent: "codex" })?.id,
    ).toBe("claude");
    expect(preferredAgent([], DEFAULT_SETTINGS)).toBeUndefined();
  });
});
