import { describe, expect, it } from "vitest";
import { resolveTemplate, type VariableScopes } from "./variables";

const emptyScopes: VariableScopes = {
  global: {},
  collection: {},
  environment: {},
  data: {},
  local: {},
};

describe("resolveTemplate", () => {
  it("replaces a variable from a single scope", () => {
    const scopes = { ...emptyScopes, environment: { host: "api.example.com" } };
    expect(resolveTemplate("https://{{host}}/users", scopes)).toBe("https://api.example.com/users");
  });

  it("uses Postman precedence: local > data > environment > collection > global", () => {
    const scopes: VariableScopes = {
      global: { a: "global", b: "global", c: "global", d: "global", e: "global" },
      collection: { a: "collection", b: "collection", c: "collection", d: "collection" },
      environment: { a: "environment", b: "environment", c: "environment" },
      data: { a: "data", b: "data" },
      local: { a: "local" },
    };
    expect(resolveTemplate("{{a}} {{b}} {{c}} {{d}} {{e}}", scopes)).toBe(
      "local data environment collection global",
    );
  });

  it("leaves unknown variables untouched", () => {
    expect(resolveTemplate("{{missing}}/x", emptyScopes)).toBe("{{missing}}/x");
  });

  it("tolerates whitespace inside the braces", () => {
    const scopes = { ...emptyScopes, global: { token: "abc" } };
    expect(resolveTemplate("Bearer {{ token }}", scopes)).toBe("Bearer abc");
  });

  it("does not re-resolve values that themselves contain braces", () => {
    const scopes = { ...emptyScopes, global: { a: "{{b}}", b: "nope" } };
    expect(resolveTemplate("{{a}}", scopes)).toBe("{{b}}");
  });

  it("does not mutate the scopes", () => {
    const scopes = { ...emptyScopes, global: { a: "1" } };
    const snapshot = structuredClone(scopes);
    resolveTemplate("{{a}}", scopes);
    expect(scopes).toEqual(snapshot);
  });
});
