import { describe, expect, it } from "vitest";
import { REDACTED, isSensitiveName, maskValue, scrubDeep, scrubText } from "./scrub";

describe("isSensitiveName", () => {
  it.each([
    "Authorization",
    "Proxy-Authorization",
    "Cookie",
    "Set-Cookie",
    "X-Api-Key",
    "api_key",
    "password",
    "client_secret",
    "access_token",
    "X-CSRF-Token",
    "sessionId",
    "auth",
    "privateKey",
  ])("treats %s as sensitive", (name) => {
    expect(isSensitiveName(name)).toBe(true);
  });

  it.each(["Content-Type", "Accept", "author", "key", "id", "user", "x-request-id", "max_tokens"])(
    "leaves %s alone",
    (name) => {
      expect(isSensitiveName(name)).toBe(false);
    },
  );
});

describe("maskValue", () => {
  it("hides literal values", () => {
    expect(maskValue("abc123")).toBe(REDACTED);
  });

  it("keeps empty values and pure placeholders, which show how auth is wired", () => {
    expect(maskValue("")).toBe("");
    expect(maskValue("{{token}}")).toBe("{{token}}");
    expect(maskValue("Bearer {{token}}")).toBe("Bearer {{token}}");
    expect(maskValue("{{user}}:{{pass}}")).toBe("{{user}}:{{pass}}");
  });

  it("leaves values that are already hidden as they are", () => {
    expect(maskValue("[secret:token]")).toBe("[secret:token]");
    expect(maskValue("Bearer [redacted]")).toBe("Bearer [redacted]");
  });

  it("hides a placeholder mixed with a literal secret", () => {
    expect(maskValue("{{prefix}}abc123")).toBe(REDACTED);
  });
});

describe("scrubText", () => {
  const secrets = [
    { name: "apiKey", value: "sk-live-1234567890" },
    { name: null, value: "remembered-key-xyz" },
  ];

  it("replaces known secret values wherever they appear", () => {
    const text = "url?key=sk-live-1234567890 and remembered-key-xyz twice: sk-live-1234567890";
    const out = scrubText(text, secrets);
    expect(out).not.toContain("sk-live-1234567890");
    expect(out).not.toContain("remembered-key-xyz");
    expect(out).toContain("[secret:apiKey]");
    expect(out).toContain(REDACTED);
  });

  it("replaces the longest secret first so overlapping secrets do not leak a tail", () => {
    const out = scrubText("abcdefgh", [
      { name: "short", value: "abcd" },
      { name: "long", value: "abcdefgh" },
    ]);
    expect(out).toBe("[secret:long]");
  });

  it("ignores very short secret values to avoid mangling ordinary text", () => {
    expect(scrubText("a b c", [{ name: "x", value: "b" }])).toBe("a b c");
  });

  it("hides JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(scrubText(`token is ${jwt}.`, [])).toBe(`token is ${REDACTED}.`);
  });

  it("hides Bearer and Basic credentials but keeps placeholders", () => {
    expect(scrubText("Authorization: Bearer abc.def-123", [])).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
    expect(scrubText("Basic dXNlcjpwYXNz", [])).toBe(`Basic ${REDACTED}`);
    expect(scrubText("Bearer {{token}}", [])).toBe("Bearer {{token}}");
  });

  it("hides string values of sensitive JSON keys", () => {
    const body = '{"user":"ann","password":"hunter2","access_token":"x\\"y","max_tokens":5}';
    expect(JSON.parse(scrubText(body, []))).toEqual({
      user: "ann",
      password: REDACTED,
      access_token: REDACTED,
      max_tokens: 5,
    });
  });

  it("hides sensitive query parameters", () => {
    expect(scrubText("https://x.dev/a?api_key=abc&page=2&token={{t}}", [])).toBe(
      `https://x.dev/a?api_key=${REDACTED}&page=2&token={{t}}`,
    );
  });
});

describe("scrubDeep", () => {
  it("walks objects and arrays without changing the input", () => {
    const input = {
      list: ["sk-live-1234567890", 3, null, true],
      nested: { secret: "plain", note: "fine" },
    } as const;
    const out = scrubDeep(input, [{ name: "k", value: "sk-live-1234567890" }]);
    expect(out).toEqual({
      list: ["[secret:k]", 3, null, true],
      nested: { secret: REDACTED, note: "fine" },
    });
    expect(input.list[0]).toBe("sk-live-1234567890");
  });
});
