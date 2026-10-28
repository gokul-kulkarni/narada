import { newId } from "./ids";
import type { Collection, Environment, HttpRequestDef, KeyValue } from "./model";

export const newKeyValue = (key = "", value = ""): KeyValue => ({
  id: newId(),
  key,
  value,
  enabled: true,
});

export const newRequest = (overrides: Partial<HttpRequestDef> = {}): HttpRequestDef => ({
  protocol: "http",
  id: newId(),
  name: "New Request",
  method: "GET",
  url: "",
  headers: [],
  body: { mode: "none" },
  auth: { type: "inherit" },
  preRequestScript: "",
  testScript: "",
  ...overrides,
});

export const newCollection = (name = "New Collection"): Collection => ({
  id: newId(),
  name,
  description: "",
  auth: { type: "none" },
  variables: [],
  items: [],
  preRequestScript: "",
  testScript: "",
});

export const newEnvironment = (name = "New Environment"): Environment => ({
  id: newId(),
  name,
  variables: [],
});
