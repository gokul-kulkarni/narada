import type { JsonObject } from "../model";

export type FieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "json";

/** One input of a tool's arguments form, read from its JSON Schema. */
export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly description: string | null;
  readonly kind: FieldKind;
  readonly required: boolean;
  /** Choices of an enum field, as the schema lists them. */
  readonly options: readonly unknown[];
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** `"string"`, or the first non-null type of `["string", "null"]`. */
function schemaType(schema: Record<string, unknown>): string | null {
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return type.find((t) => t !== "null") ?? null;
  return null;
}

function kindOf(schema: Record<string, unknown>): FieldKind {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return "enum";
  const type = schemaType(schema);
  return type === "string" || type === "number" || type === "integer" || type === "boolean"
    ? type
    : "json";
}

export function fieldsFor(inputSchema: unknown): FormField[] {
  const schema = record(inputSchema);
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(record(schema.properties)).map(([name, raw]) => {
    const property = record(raw);
    return {
      name,
      label: typeof property.title === "string" ? property.title : name,
      description: typeof property.description === "string" ? property.description : null,
      kind: kindOf(property),
      required: required.has(name),
      options: Array.isArray(property.enum) ? property.enum : [],
    };
  });
}

/** How a stored argument appears in its input while editing. */
export function fieldText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

type Coerced =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

function coerce(field: FormField, value: unknown): Coerced {
  if (typeof value !== "string") return { ok: true, value };
  const text = value.trim();
  switch (field.kind) {
    case "string":
      return { ok: true, value };
    case "number":
    case "integer": {
      const number = Number(text);
      if (text === "" || Number.isNaN(number)) return { ok: false, error: "Enter a number" };
      if (field.kind === "integer" && !Number.isInteger(number)) {
        return { ok: false, error: "Enter a whole number" };
      }
      return { ok: true, value: number };
    }
    case "boolean":
      return text === "true" || text === "false"
        ? { ok: true, value: text === "true" }
        : { ok: false, error: "Choose true or false" };
    case "enum": {
      const option = field.options.find((o) => fieldText(o) === value);
      return option === undefined
        ? { ok: false, error: "Choose one of the options" }
        : { ok: true, value: option };
    }
    case "json":
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false, error: "Enter valid JSON" };
      }
  }
}

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

export type ArgumentsCheck =
  | { readonly ok: true; readonly arguments: JsonObject }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

/**
 * Turns edited values into typed arguments. Blank optional fields are left out;
 * arguments the schema does not describe (from Raw JSON) pass through unchanged.
 */
export function checkArguments(fields: readonly FormField[], values: JsonObject): ArgumentsCheck {
  const described = new Set(fields.map((f) => f.name));
  const extra = Object.entries(values).filter(([name]) => !described.has(name));
  const results = fields.map((field) => {
    const value = values[field.name];
    if (isBlank(value)) {
      return field.required
        ? { name: field.name, result: { ok: false, error: "Required" } as Coerced }
        : null;
    }
    return { name: field.name, result: coerce(field, value) };
  });
  const present = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const errors = present.flatMap(({ name, result }) => (result.ok ? [] : [[name, result.error]]));
  if (errors.length > 0) return { ok: false, errors: Object.fromEntries(errors) };
  return {
    ok: true,
    arguments: Object.fromEntries([
      ...extra,
      ...present.map(({ name, result }) => [name, result.ok ? result.value : undefined]),
    ]),
  };
}
