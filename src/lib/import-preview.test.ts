import { describe, expect, it } from "vitest";
import { previewImport } from "./import-preview";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "./postman/fixtures";

describe("previewImport", () => {
  it("summarises a collection with its folder and request counts", () => {
    expect(previewImport("pets.json", JSON.stringify(POSTMAN_COLLECTION))).toMatchObject({
      ok: true,
      source: "pets.json",
      kind: "collection",
      title: "Pet Store",
      detail: "Collection · 1 folder · 4 requests",
    });
  });

  it("summarises an environment and a curl command", () => {
    expect(previewImport("env.json", JSON.stringify(POSTMAN_ENVIRONMENT))).toMatchObject({
      ok: true,
      kind: "environment",
      title: POSTMAN_ENVIRONMENT.name,
      detail: `Environment · ${POSTMAN_ENVIRONMENT.values.length} variables`,
    });
    expect(previewImport("Pasted text", "curl -X POST https://a.dev/x")).toMatchObject({
      ok: true,
      kind: "curl",
      title: "POST https://a.dev/x",
      detail: "cURL request · opens in a new tab",
    });
  });

  it("uses singular wording for one item", () => {
    const single = {
      info: { name: "One" },
      item: [{ name: "r", request: "https://a.dev" }],
    };
    expect(previewImport("one.json", JSON.stringify(single))).toMatchObject({
      detail: "Collection · 1 request",
    });
  });

  it("explains files that aren't Postman exports", () => {
    expect(previewImport("junk.json", '{"a":1}')).toMatchObject({
      ok: false,
      source: "junk.json",
      message: expect.stringMatching(/Unrecognised JSON/),
    });
    expect(previewImport("bad.json", "{")).toMatchObject({ ok: false });
  });

  it("points Postman v1 collections at the v2.1 export option", () => {
    const v1 = { id: "x", name: "Old", order: [], requests: [] };
    expect(previewImport("old.json", JSON.stringify(v1))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Collection v2\.1/),
    });
  });
});
