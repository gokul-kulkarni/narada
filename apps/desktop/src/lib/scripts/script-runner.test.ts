import { describe, expect, it } from "vitest";
import { executeScript } from "./script-runner";

describe("executeScript", () => {
  it("falls back to running inline where Workers are unavailable (tests, SSR)", async () => {
    const result = await executeScript("pm.test('t', () => {})", {
      request: { method: "GET", url: "", headers: [] },
      response: null,
      variables: { globals: {}, collection: {}, environment: {}, data: {}, local: {} },
    });
    expect(result.tests).toEqual([{ name: "t", passed: true }]);
  });
});
