import type { HttpRequestDef, RequestDef } from "../lib/model";

/** Narrows a request in tests that only deal with HTTP; fails loudly otherwise. */
export function asHttp(request: RequestDef | undefined): HttpRequestDef {
  if (request?.protocol !== "http") throw new Error("Expected an HTTP request");
  return request;
}
