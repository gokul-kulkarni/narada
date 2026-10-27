import { z } from "zod";

/** Postman stores some values as numbers/booleans; we always work with strings. */
const text = z
  .unknown()
  .transform((value) =>
    value == null ? "" : typeof value === "string" ? value : JSON.stringify(value),
  );

export const keyValueSchema = z.object({
  key: text,
  value: text,
  disabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  type: z.string().optional(),
});
export type PostmanKeyValue = z.infer<typeof keyValueSchema>;

const keyValueList = z
  .array(z.unknown())
  .catch([])
  .transform((items) =>
    items.flatMap((item) => {
      const parsed = keyValueSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  );

/** v2.1 uses `[{key, value}]` per auth type; v2.0 used a plain object. */
const authParams = z
  .union([keyValueList, z.record(z.string(), z.unknown())])
  .transform((params): Record<string, string> =>
    Array.isArray(params)
      ? Object.fromEntries(params.map((p) => [p.key, p.value]))
      : Object.fromEntries(Object.entries(params).map(([k, v]) => [k, text.parse(v)])),
  );

export const authSchema = z
  .object({ type: z.string() })
  .catchall(z.unknown())
  .transform((auth) => ({
    type: auth.type,
    params: authParams.catch({}).parse(auth[auth.type] ?? []),
  }));
export type PostmanAuth = z.infer<typeof authSchema>;

export const eventListSchema = z
  .array(
    z.object({
      listen: z.string(),
      script: z.object({ exec: z.union([z.array(z.string()), z.string()]).optional() }).optional(),
    }),
  )
  .catch([]);

export const urlSchema = z.union([
  z.string(),
  z.object({
    raw: z.string().optional(),
    protocol: z.string().optional(),
    host: z.union([z.array(z.string()), z.string()]).optional(),
    port: z.string().optional(),
    path: z.union([z.array(z.string()), z.string()]).optional(),
    query: keyValueList.optional(),
  }),
]);

export const bodySchema = z
  .object({
    mode: z.string(),
    raw: z.string().optional(),
    urlencoded: keyValueList.optional(),
    formdata: keyValueList.optional(),
    options: z.object({ raw: z.object({ language: z.string().optional() }).optional() }).optional(),
  })
  .optional()
  .catch(undefined);

export const requestSchema = z.union([
  z.string(),
  z.object({
    method: z.string().optional(),
    url: urlSchema.optional(),
    header: z.union([keyValueList, z.string()]).optional(),
    body: bodySchema,
    auth: z.unknown().optional(),
    description: z.unknown().optional(),
  }),
]);

export const infoSchema = z.object({
  _postman_id: z.string().optional(),
  name: z.string(),
  description: z.unknown().optional(),
  schema: z.string().optional(),
});

export const environmentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  values: keyValueList,
});

export const descriptionText = (description: unknown): string =>
  typeof description === "string"
    ? description
    : typeof description === "object" && description !== null && "content" in description
      ? text.parse((description as { content: unknown }).content)
      : "";
