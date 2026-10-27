import { describe, expect, it } from "vitest";
import { applyAuth, effectiveAuth } from "./auth";
import type { Auth } from "./model";

describe("effectiveAuth", () => {
  it("walks up the chain past inherit entries", () => {
    const chain: Auth[] = [
      { type: "inherit" },
      { type: "inherit" },
      { type: "bearer", token: "t" },
    ];
    expect(effectiveAuth(chain)).toEqual({ type: "bearer", token: "t" });
  });

  it("stops at the first explicit entry, including none", () => {
    expect(effectiveAuth([{ type: "none" }, { type: "bearer", token: "t" }])).toEqual({
      type: "none",
    });
  });

  it("defaults to none when everything inherits", () => {
    expect(effectiveAuth([{ type: "inherit" }])).toEqual({ type: "none" });
  });
});

describe("applyAuth", () => {
  const base = { url: "https://x.dev/a", headers: [] as [string, string][] };

  it("adds a basic auth header", () => {
    const result = applyAuth(base, { type: "basic", username: "ada", password: "pw" });
    expect(result.headers).toEqual([["Authorization", `Basic ${btoa("ada:pw")}`]]);
  });

  it("encodes non-ASCII basic credentials as UTF-8", () => {
    const result = applyAuth(base, { type: "basic", username: "é", password: "" });
    expect(result.headers[0][1]).toBe("Basic w6k6");
  });

  it("adds a bearer header", () => {
    expect(applyAuth(base, { type: "bearer", token: "abc" }).headers).toEqual([
      ["Authorization", "Bearer abc"],
    ]);
  });

  it("uses the oauth2 access token as a bearer token", () => {
    const auth: Auth = {
      type: "oauth2",
      tokenUrl: "",
      clientId: "",
      clientSecret: "",
      scope: "",
      accessToken: "tok",
    };
    expect(applyAuth(base, auth).headers).toEqual([["Authorization", "Bearer tok"]]);
  });

  it("adds an API key header or query param", () => {
    expect(
      applyAuth(base, { type: "apikey", key: "X-Key", value: "k", in: "header" }).headers,
    ).toEqual([["X-Key", "k"]]);
    expect(applyAuth(base, { type: "apikey", key: "key", value: "k", in: "query" }).url).toBe(
      "https://x.dev/a?key=k",
    );
  });

  it("does not override an explicit Authorization header", () => {
    const withHeader = { ...base, headers: [["authorization", "Custom"]] as [string, string][] };
    expect(applyAuth(withHeader, { type: "bearer", token: "abc" }).headers).toEqual([
      ["authorization", "Custom"],
    ]);
  });

  it("leaves the request alone for none and empty tokens", () => {
    expect(applyAuth(base, { type: "none" })).toEqual(base);
    expect(applyAuth(base, { type: "bearer", token: "" })).toEqual(base);
  });
});
