import { describe, expect, it } from "vitest";
import { buildTokenRequest, parseTokenResponse } from "./oauth2";

const auth = {
  type: "oauth2" as const,
  tokenUrl: "https://auth.dev/token",
  clientId: "id",
  clientSecret: "sec",
  scope: "read write",
  accessToken: "",
};

describe("oauth2 client credentials", () => {
  it("builds a form POST with basic client credentials", () => {
    expect(buildTokenRequest(auth)).toEqual({
      method: "POST",
      url: "https://auth.dev/token",
      headers: [
        ["Content-Type", "application/x-www-form-urlencoded"],
        ["Accept", "application/json"],
        ["Authorization", `Basic ${btoa("id:sec")}`],
      ],
      body: { type: "text", content: "grant_type=client_credentials&scope=read+write" },
      timeoutMs: 30000,
    });
    expect(() => buildTokenRequest({ ...auth, tokenUrl: " " })).toThrow(/token URL/);
  });

  it("parses JSON and form token responses and explains errors", () => {
    expect(parseTokenResponse(200, '{"access_token":"t","expires_in":3600}')).toBe("t");
    expect(parseTokenResponse(200, "access_token=f&token_type=bearer")).toBe("f");
    expect(() =>
      parseTokenResponse(401, '{"error":"invalid_client","error_description":"bad secret"}'),
    ).toThrow("Token request failed (401): invalid_client: bad secret");
    expect(() => parseTokenResponse(200, "{}")).toThrow("Token request failed (200)");
  });
});
