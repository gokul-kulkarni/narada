import { z } from "zod";
import { findRequest } from "../collection-tree";
import { newKeyValue, newRequest } from "../factories";
import type { HttpRequestDef, RequestBody } from "../model";
import { describeIssue, newRequestSchema } from "./create";
import type { ToolWorkspace } from "./tools";

/** What `send_request` sends: a saved request, or a one-off that is not saved. */
export type SendTarget =
  | { readonly kind: "saved"; readonly collectionId: string; readonly request: HttpRequestDef }
  | { readonly kind: "adhoc"; readonly request: HttpRequestDef };

export type SendArgsResult = { readonly target: SendTarget } | { readonly error: string };

const sendArgs = z.object({
  requestId: z.string().min(1).optional(),
  request: newRequestSchema.optional(),
});

type NewRequest = z.infer<typeof newRequestSchema>;

function toBody(body: NewRequest["body"]): RequestBody {
  if (!body || body.mode === "none") return { mode: "none" };
  if (body.mode === "raw") return body;
  return { mode: body.mode, fields: body.fields.map((f) => newKeyValue(f.key, f.value)) };
}

export function parseSendArgs(workspace: ToolWorkspace, args: unknown): SendArgsResult {
  const parsed = sendArgs.safeParse(args ?? {});
  if (!parsed.success) return { error: describeIssue(parsed.error) };
  const { requestId, request } = parsed.data;
  if ((requestId === undefined) === (request === undefined)) {
    return { error: "Give either requestId or request." };
  }
  if (request) {
    return {
      target: {
        kind: "adhoc",
        request: newRequest({
          name: request.name,
          method: request.method,
          url: request.url,
          headers: request.headers.map((h) => newKeyValue(h.key, h.value)),
          body: toBody(request.body),
        }),
      },
    };
  }
  const id = requestId ?? "";
  const collection = workspace.collections.find((c) => findRequest(c, id));
  const found = collection && findRequest(collection, id);
  if (!collection || !found) {
    return { error: `No saved request with id "${id}". Use list_collections to find one.` };
  }
  if (found.request.protocol !== "http") {
    return { error: "Only HTTP requests can be sent by an agent for now." };
  }
  return { target: { kind: "saved", collectionId: collection.id, request: found.request } };
}

/** "shop.dev:8443" for a full URL; null when it isn't one (e.g. still has {{variables}}). */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}
