import { describe, expect, it } from "vitest";
import { fromPostmanEnvironment, toPostmanEnvironment } from "./environment";
import { POSTMAN_ENVIRONMENT } from "./fixtures";

describe("Postman environments", () => {
  it("reads variables with secret and enabled flags", () => {
    const env = fromPostmanEnvironment(POSTMAN_ENVIRONMENT);
    expect(env.id).toBe(POSTMAN_ENVIRONMENT.id);
    expect(env.name).toBe("Staging");
    expect(env.variables.map((v) => [v.key, v.value, v.secret, v.enabled])).toEqual([
      ["baseUrl", "https://staging.dev", false, true],
      ["token", "s3cret", true, true],
      ["old", "1", false, false],
    ]);
  });

  it("round-trips", () => {
    const env = fromPostmanEnvironment(POSTMAN_ENVIRONMENT);
    expect(fromPostmanEnvironment(toPostmanEnvironment(env))).toEqual(env);
    expect(toPostmanEnvironment(env)).toMatchObject({ _postman_variable_scope: "environment" });
  });

  it("rejects other documents", () => {
    expect(() => fromPostmanEnvironment({ info: {} })).toThrow(/not a Postman environment/i);
  });
});
