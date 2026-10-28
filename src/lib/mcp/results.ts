import { z } from "zod";

/**
 * Server replies are untrusted, so everything shown is parsed here first. Unknown fields
 * are kept (the Raw view shows the reply as sent); unknown shapes fall back to "other".
 */
const jsonSchemaObject = z.record(z.string(), z.unknown());

const toolSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: jsonSchemaObject.default({ type: "object" }),
});
const resourceSchema = z.object({
  uri: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});
const templateSchema = z.object({
  uriTemplate: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});
const promptSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .default([]),
});

export type McpTool = z.infer<typeof toolSchema>;
export type McpResource = z.infer<typeof resourceSchema>;
export type McpResourceTemplate = z.infer<typeof templateSchema>;
export type McpPrompt = z.infer<typeof promptSchema>;

/** Keeps the entries that parse; a server's odd entry should not hide the rest. */
const parseEach =
  <T>(schema: z.ZodType<T>) =>
  (items: readonly unknown[]): T[] =>
    items.flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });

export const parseTools = parseEach(toolSchema);
export const parseResources = parseEach(resourceSchema);
export const parseTemplates = parseEach(templateSchema);
export const parsePrompts = parseEach(promptSchema);

/** One displayable piece of a reply. */
export type ContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image" | "audio"; readonly data: string; readonly mimeType: string }
  | {
      readonly type: "resource";
      readonly uri: string;
      readonly text: string | null;
      readonly mimeType: string | null;
    }
  | { readonly type: "link"; readonly uri: string; readonly name: string | null }
  | { readonly type: "other"; readonly value: unknown };

const blockSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.enum(["image", "audio"]), data: z.string(), mimeType: z.string() }),
  z.object({
    type: z.literal("resource"),
    resource: z.object({
      uri: z.string(),
      text: z.string().optional(),
      mimeType: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal("resource_link"), uri: z.string(), name: z.string().optional() }),
]);

function toBlock(value: unknown): ContentBlock {
  const parsed = blockSchema.safeParse(value);
  if (!parsed.success) return { type: "other", value };
  const block = parsed.data;
  switch (block.type) {
    case "resource":
      return {
        type: "resource",
        uri: block.resource.uri,
        text: block.resource.text ?? null,
        mimeType: block.resource.mimeType ?? null,
      };
    case "resource_link":
      return { type: "link", uri: block.uri, name: block.name ?? null };
    default:
      return block;
  }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A tool result: its content blocks, structured output and whether the tool failed. */
export function readToolResult(result: unknown) {
  const r = record(result);
  return {
    blocks: list(r.content).map(toBlock),
    structured: r.structuredContent ?? null,
    isError: r.isError === true,
  };
}

/** The contents of a read resource, shown as content blocks. */
export function readResourceResult(result: unknown): ContentBlock[] {
  return list(record(result).contents).map((item) => {
    const c = record(item);
    const uri = typeof c.uri === "string" ? c.uri : "";
    const mimeType = typeof c.mimeType === "string" ? c.mimeType : null;
    if (typeof c.text === "string") return { type: "resource", uri, text: c.text, mimeType };
    if (typeof c.blob === "string" && mimeType?.startsWith("image/")) {
      return { type: "image", data: c.blob, mimeType };
    }
    return { type: "resource", uri, text: null, mimeType };
  });
}

/** The messages a prompt expands to. */
export function readPromptResult(result: unknown) {
  const r = record(result);
  return {
    description: typeof r.description === "string" ? r.description : null,
    messages: list(r.messages).map((m) => ({
      role: String(record(m).role ?? "user"),
      block: toBlock(record(m).content),
    })),
  };
}

/** Text that is JSON is shown pretty-printed. */
export function prettyText(text: string): string {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}
