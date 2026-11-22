import { describe, expect, it } from "vitest";
import { detectImport } from "./import-detect";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "./postman/fixtures";

describe("detectImport", () => {
  it("detects curl, collections and environments", () => {
    expect(detectImport("  curl https://a.dev").kind).toBe("curl");
    expect(detectImport(JSON.stringify(POSTMAN_COLLECTION)).kind).toBe("collection");
    expect(detectImport(JSON.stringify(POSTMAN_ENVIRONMENT)).kind).toBe("environment");
  });

  it("explains what went wrong", () => {
    expect(() => detectImport("hello")).toThrow(/curl command/);
    expect(() => detectImport('{"a":1}')).toThrow(/Unrecognised JSON/);
    expect(() => detectImport("null")).toThrow(/Unrecognised JSON/);
  });

  it("recognises an mcpServers config", () => {
    expect(detectImport('{"mcpServers": {"a": {"command": "x"}}}').kind).toBe("mcp");
  });
});
