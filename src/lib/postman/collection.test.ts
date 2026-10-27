import { describe, expect, it } from "vitest";
import type { FolderItem, RequestItem } from "../model";
import { fromPostmanCollection, toPostmanCollection } from "./collection";
import { POSTMAN_COLLECTION } from "./fixtures";

describe("fromPostmanCollection", () => {
  const collection = fromPostmanCollection(POSTMAN_COLLECTION);
  const [folder, create, login, upload] = collection.items as [
    FolderItem,
    RequestItem,
    RequestItem,
    RequestItem,
  ];
  const list = (folder.items[0] as RequestItem).request;

  it("reads collection metadata, auth, variables and scripts", () => {
    expect(collection).toMatchObject({
      id: "8b1c5a54-0000-4000-8000-000000000001",
      name: "Pet Store",
      description: "Demo API",
      auth: { type: "bearer", token: "{{token}}" },
      preRequestScript: "console.log('c');",
      testScript: "",
    });
    expect(collection.variables.map((v) => [v.key, v.value, v.enabled])).toEqual([
      ["baseUrl", "https://petstore.dev", true],
      ["unused", "x", false],
    ]);
  });

  it("reads folders and requests with headers, urls and scripts", () => {
    expect(folder).toMatchObject({ kind: "folder", name: "Pets", auth: { type: "none" } });
    expect(list).toMatchObject({
      id: "req-list",
      name: "List pets",
      method: "GET",
      url: "{{baseUrl}}/pets?limit=10",
      auth: { type: "inherit" },
    });
    expect(list.headers.map((h) => [h.key, h.enabled])).toEqual([
      ["Accept", true],
      ["X-Off", false],
    ]);
    expect(list.testScript).toBe("pm.test('ok', () => {\n  pm.response.to.have.status(200);\n});");
  });

  it("reads every body mode and auth type", () => {
    expect(create.request.body).toEqual({ mode: "raw", raw: '{"name":"Rex"}', language: "json" });
    expect(create.request.auth).toEqual({
      type: "apikey",
      key: "X-Api-Key",
      value: "{{apiKey}}",
      in: "header",
    });
    expect(login.request.auth).toEqual({ type: "basic", username: "ada", password: "pw" });
    expect(login.request.body).toMatchObject({
      mode: "urlencoded",
      fields: [{ key: "grant" }, { key: "off", enabled: false }],
    });
    expect(upload.request.body).toMatchObject({
      mode: "formdata",
      fields: [{ key: "title", value: "a" }],
    });
    expect(upload.request.url).toBe("{{baseUrl}}/upload");
  });

  it("assigns ids when Postman omits them", () => {
    expect(create.request.id).toMatch(/[0-9a-f-]{36}/);
    expect(folder.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects documents that are not collections", () => {
    expect(() => fromPostmanCollection({ hello: "world" })).toThrow(/not a Postman collection/i);
  });

  it("maps unknown auth types to none and odd bodies to none", () => {
    const parsed = fromPostmanCollection({
      info: { name: "X", schema: POSTMAN_COLLECTION.info.schema },
      auth: { type: "hawk", hawk: [] },
      item: [{ name: "r", request: { method: "get", url: "", body: { mode: "file", file: {} } } }],
    });
    expect(parsed.auth).toEqual({ type: "none" });
    expect((parsed.items[0] as RequestItem).request).toMatchObject({
      method: "GET",
      body: { mode: "none" },
    });
  });

  it("accepts string requests (the shortest Postman form)", () => {
    const parsed = fromPostmanCollection({
      info: { name: "X" },
      item: [{ name: "r", request: "https://a.dev" }],
    });
    expect((parsed.items[0] as RequestItem).request).toMatchObject({
      method: "GET",
      url: "https://a.dev",
    });
  });
});

describe("toPostmanCollection", () => {
  it("round-trips without losing data", () => {
    const collection = fromPostmanCollection(POSTMAN_COLLECTION);
    const again = fromPostmanCollection(
      JSON.parse(JSON.stringify(toPostmanCollection(collection))),
    );
    expect(again).toEqual(collection);
  });

  it("writes the v2.1 schema and Postman auth/body shapes", () => {
    const out = JSON.parse(
      JSON.stringify(toPostmanCollection(fromPostmanCollection(POSTMAN_COLLECTION))),
    );
    expect(out.info.schema).toBe(POSTMAN_COLLECTION.info.schema);
    expect(out.auth).toEqual({
      type: "bearer",
      bearer: [{ key: "token", value: "{{token}}", type: "string" }],
    });
    expect(out.item[0].auth).toEqual({ type: "noauth" });
    expect(out.item[0].item[0].request.auth).toBeUndefined();
    expect(out.item[1].request.body).toEqual({
      mode: "raw",
      raw: '{"name":"Rex"}',
      options: { raw: { language: "json" } },
    });
    expect(out.item[0].item[0].event[0]).toEqual({
      listen: "test",
      script: {
        type: "text/javascript",
        exec: ["pm.test('ok', () => {", "  pm.response.to.have.status(200);", "});"],
      },
    });
  });

  it("round-trips oauth2 auth", () => {
    const parsed = fromPostmanCollection({
      info: { name: "X" },
      auth: {
        type: "oauth2",
        oauth2: [
          { key: "accessTokenUrl", value: "https://auth.dev/token" },
          { key: "clientId", value: "id" },
          { key: "clientSecret", value: "sec" },
          { key: "scope", value: "read" },
          { key: "accessToken", value: "tok" },
          { key: "grant_type", value: "client_credentials" },
        ],
      },
      item: [],
    });
    expect(parsed.auth).toEqual({
      type: "oauth2",
      tokenUrl: "https://auth.dev/token",
      clientId: "id",
      clientSecret: "sec",
      scope: "read",
      accessToken: "tok",
    });
    expect(fromPostmanCollection(toPostmanCollection(parsed))).toEqual(parsed);
  });
});
