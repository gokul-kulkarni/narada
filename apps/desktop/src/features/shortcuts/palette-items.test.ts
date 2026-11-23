import { describe, expect, it } from "vitest";
import { newRequest } from "@narada/core/factories";
import type { Collection } from "@narada/core/model";
import { commandEntries, filterEntries, requestEntries } from "./palette-items";

const users = newRequest({ name: "List users", url: "https://api.dev/users" });
const login = newRequest({ name: "Login", url: "https://api.dev/auth/login" });
const collection = {
  id: "c1",
  name: "Shop",
  items: [
    { kind: "request", request: users },
    { kind: "folder", id: "f1", name: "Auth", items: [{ kind: "request", request: login }] },
  ],
} as unknown as Collection;

describe("palette entries", () => {
  it("lists saved requests with where they live", () => {
    const entries = requestEntries([collection], []);
    expect(entries.map((e) => [e.request.name, e.where])).toEqual([
      ["List users", "Shop"],
      ["Login", "Shop › Auth"],
    ]);
  });

  it("finds requests by any words of name, folder or URL, names first", () => {
    const entries = requestEntries([collection], []);
    expect(filterEntries(entries, "auth").map((e) => e.request.name)).toEqual(["Login"]);
    expect(filterEntries(entries, "shop users").map((e) => e.request.name)).toEqual(["List users"]);
    expect(filterEntries(entries, "l").map((e) => e.request.name)).toEqual(["List users", "Login"]);
    expect(filterEntries(entries, "nothing")).toEqual([]);
  });

  it("finds commands by title", () => {
    const found = filterEntries(commandEntries(), "close tab").map((e) => e.command.id);
    expect(found).toContain("tab.close");
  });
});
