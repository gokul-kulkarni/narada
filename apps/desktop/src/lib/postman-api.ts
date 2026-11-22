import { z } from "zod";
import type { HttpResponse } from "./model";
import type { PreparedRequest } from "./prepare-request";

export const POSTMAN_API_URL = "https://api.getpostman.com";
export const POSTMAN_API_KEY_SECRET = "postman:api-key";
const TIMEOUT_MS = 30_000;

export interface PostmanWorkspace {
  readonly id: string;
  readonly name: string;
}

export interface PostmanEntry {
  readonly uid: string;
  readonly name: string;
}

export interface PostmanApi {
  listWorkspaces(): Promise<PostmanWorkspace[]>;
  listCollections(workspaceId: string): Promise<PostmanEntry[]>;
  listEnvironments(workspaceId: string): Promise<PostmanEntry[]>;
  /** Raw Postman v2.1 collection JSON, ready for `importCollection`. */
  getCollection(uid: string): Promise<unknown>;
  /** Raw Postman environment JSON, ready for `importEnvironment`. */
  getEnvironment(uid: string): Promise<unknown>;
}

type Send = (request: PreparedRequest) => Promise<HttpResponse>;

const entry = z.object({ uid: z.string(), name: z.string() });
const schemas = {
  workspaces: z.object({ workspaces: z.array(z.object({ id: z.string(), name: z.string() })) }),
  collections: z.object({ collections: z.array(entry) }),
  environments: z.object({ environments: z.array(entry) }),
  collection: z.object({ collection: z.unknown() }),
  environment: z.object({ environment: z.unknown() }),
};
const errorBody = z.object({ error: z.object({ message: z.string() }) });

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function failure(response: HttpResponse, json: unknown): Error {
  if (response.status === 401 || response.status === 403)
    return new Error(
      "Postman API key was rejected. Check the key in Postman → Settings → API keys.",
    );
  if (response.status === 429)
    return new Error("Postman API rate limit reached. Wait a minute and try again.");
  const parsed = errorBody.safeParse(json);
  const detail = parsed.success
    ? parsed.data.error.message
    : response.statusText || "request failed";
  return new Error(`Postman API error (${response.status}): ${detail}`);
}

/** Read-only client for the Postman API; requests go through the app's HTTP layer (no CORS). */
export function createPostmanApi(apiKey: string, send: Send): PostmanApi {
  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await send({
      method: "GET",
      url: `${POSTMAN_API_URL}${path}`,
      headers: [["X-Api-Key", apiKey]],
      body: { type: "none" },
      timeoutMs: TIMEOUT_MS,
    });
    const json = parseJson(response.body);
    if (response.status < 200 || response.status >= 300) throw failure(response, json);
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error(`Unexpected response from the Postman API for ${path}.`);
    return parsed.data;
  }

  const workspaceQuery = (id: string) => `?workspace=${encodeURIComponent(id)}`;
  const names = (entries: readonly PostmanEntry[]) =>
    entries.map(({ uid, name }) => ({ uid, name }));

  return {
    listWorkspaces: async () =>
      (await get("/workspaces", schemas.workspaces)).workspaces.map(({ id, name }) => ({
        id,
        name,
      })),
    listCollections: async (workspaceId) =>
      names(
        (await get(`/collections${workspaceQuery(workspaceId)}`, schemas.collections)).collections,
      ),
    listEnvironments: async (workspaceId) =>
      names(
        (await get(`/environments${workspaceQuery(workspaceId)}`, schemas.environments))
          .environments,
      ),
    getCollection: async (uid) =>
      (await get(`/collections/${encodeURIComponent(uid)}`, schemas.collection)).collection,
    getEnvironment: async (uid) =>
      (await get(`/environments/${encodeURIComponent(uid)}`, schemas.environment)).environment,
  };
}
