import { describe, expect, it, vi } from "vitest";
import type { HttpResponse } from "./model";
import { createPostmanApi, POSTMAN_API_URL } from "./postman-api";
import type { PreparedRequest } from "./prepare-request";
import { POSTMAN_COLLECTION, POSTMAN_ENVIRONMENT } from "./postman/fixtures";

const reply = (status: number, body: unknown): HttpResponse => ({
  status,
  statusText: "",
  headers: [],
  body: JSON.stringify(body),
  isBinary: false,
  sizeBytes: 0,
  timeMs: 1,
});

function apiWith(routes: Record<string, HttpResponse>) {
  const send = vi.fn(async (request: PreparedRequest) => {
    const path = request.url.slice(POSTMAN_API_URL.length);
    const response = routes[path];
    if (!response) throw new Error(`unexpected ${path}`);
    return response;
  });
  return { api: createPostmanApi("PMAK-123", send), send };
}

describe("createPostmanApi", () => {
  it("lists workspaces with the API key header", async () => {
    const { api, send } = apiWith({
      "/workspaces": reply(200, {
        workspaces: [{ id: "w1", name: "My Workspace", type: "personal" }],
      }),
    });
    expect(await api.listWorkspaces()).toEqual([{ id: "w1", name: "My Workspace" }]);
    expect(send.mock.calls[0]![0]).toMatchObject({
      method: "GET",
      headers: [["X-Api-Key", "PMAK-123"]],
      body: { type: "none" },
    });
  });

  it("lists collections and environments of a workspace", async () => {
    const { api } = apiWith({
      "/collections?workspace=w1": reply(200, {
        collections: [{ id: "c1", uid: "u-c1", name: "Pets", owner: "1" }],
      }),
      "/environments?workspace=w1": reply(200, {
        environments: [{ id: "e1", uid: "u-e1", name: "Staging" }],
      }),
    });
    expect(await api.listCollections("w1")).toEqual([{ uid: "u-c1", name: "Pets" }]);
    expect(await api.listEnvironments("w1")).toEqual([{ uid: "u-e1", name: "Staging" }]);
  });

  it("fetches full collections and environments", async () => {
    const { api } = apiWith({
      "/collections/u-c1": reply(200, { collection: POSTMAN_COLLECTION }),
      "/environments/u-e1": reply(200, { environment: POSTMAN_ENVIRONMENT }),
    });
    expect(await api.getCollection("u-c1")).toEqual(POSTMAN_COLLECTION);
    expect(await api.getEnvironment("u-e1")).toEqual(POSTMAN_ENVIRONMENT);
  });

  it("escapes ids in URLs", async () => {
    const { api, send } = apiWith({ "/collections/a%2Fb": reply(200, { collection: {} }) });
    await api.getCollection("a/b");
    expect(send.mock.calls[0]![0].url).toBe(`${POSTMAN_API_URL}/collections/a%2Fb`);
  });

  it("explains auth failures, rate limits and Postman errors", async () => {
    const { api } = apiWith({
      "/workspaces": reply(401, { error: { name: "AuthenticationError", message: "bad key" } }),
      "/collections?workspace=w1": reply(429, {}),
      "/environments?workspace=w1": reply(404, { error: { message: "Workspace not found" } }),
    });
    await expect(api.listWorkspaces()).rejects.toThrow(/API key was rejected/);
    await expect(api.listCollections("w1")).rejects.toThrow(/rate limit/i);
    await expect(api.listEnvironments("w1")).rejects.toThrow(
      "Postman API error (404): Workspace not found",
    );
  });

  it("rejects malformed responses", async () => {
    const { api } = apiWith({
      "/workspaces": reply(200, { nope: true }),
      "/collections/x": { ...reply(200, {}), body: "<html>" },
    });
    await expect(api.listWorkspaces()).rejects.toThrow(/unexpected response/i);
    await expect(api.getCollection("x")).rejects.toThrow(/unexpected response/i);
  });
});
