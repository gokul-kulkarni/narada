import { describe, expect, it } from "vitest";
import { newCollection, newEnvironment, newKeyValue, newRequest } from "./factories";
import { buildContext } from "./request-context";

describe("buildContext", () => {
  const request = newRequest({ id: "r1" });
  const collection = {
    ...newCollection(),
    auth: { type: "bearer" as const, token: "c" },
    variables: [
      newKeyValue("base", "https://c.dev"),
      { ...newKeyValue("off", "x"), enabled: false },
    ],
    items: [{ kind: "request" as const, request }],
  };
  const environment = {
    ...newEnvironment(),
    variables: [{ ...newKeyValue("token", "t"), secret: true }],
  };

  it("collects scopes and the auth chain of a saved request", () => {
    const context = buildContext({
      requestId: "r1",
      collection,
      environment,
      globals: [newKeyValue("g", "1")],
    });
    expect(context.scopes).toEqual({
      global: { g: "1" },
      collection: { base: "https://c.dev" },
      environment: { token: "t" },
      data: {},
      local: {},
    });
    expect(context.authChain).toEqual([{ type: "bearer", token: "c" }]);
  });

  it("works for unsaved requests and without a collection", () => {
    expect(
      buildContext({ requestId: null, collection, environment: undefined, globals: [] }).authChain,
    ).toEqual([collection.auth]);
    expect(
      buildContext({ requestId: null, collection: undefined, environment: undefined, globals: [] })
        .authChain,
    ).toEqual([]);
  });
});
