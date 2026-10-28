import { describe, expect, it } from "vitest";
import { checkArguments, fieldText, fieldsFor } from "./schema-form";

const schema = {
  type: "object",
  required: ["a", "mode"],
  properties: {
    a: { type: "integer", title: "First", description: "A number" },
    ratio: { type: ["number", "null"] },
    mode: { enum: ["fast", 2] },
    flag: { type: "boolean" },
    note: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
};

describe("tool argument forms", () => {
  it("reads fields from a JSON schema", () => {
    const fields = fieldsFor(schema);
    expect(fields.map((f) => [f.name, f.kind, f.required])).toEqual([
      ["a", "integer", true],
      ["ratio", "number", false],
      ["mode", "enum", true],
      ["flag", "boolean", false],
      ["note", "string", false],
      ["tags", "json", false],
    ]);
    expect(fields[0]).toMatchObject({ label: "First", description: "A number" });
    expect(fieldsFor(undefined)).toEqual([]);
  });

  it("types edited values and leaves out blank optional ones", () => {
    const result = checkArguments(fieldsFor(schema), {
      a: "2",
      ratio: "",
      mode: "2",
      flag: "true",
      note: " keep spaces ",
      tags: '["x"]',
      extra: { from: "raw json" },
    });
    expect(result).toEqual({
      ok: true,
      arguments: {
        extra: { from: "raw json" },
        a: 2,
        mode: 2,
        flag: true,
        note: " keep spaces ",
        tags: ["x"],
      },
    });
  });

  it("explains what is wrong with each field", () => {
    const result = checkArguments(fieldsFor(schema), {
      a: "2.5",
      ratio: "abc",
      flag: "maybe",
      tags: "[",
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        a: "Enter a whole number",
        ratio: "Enter a number",
        mode: "Required",
        flag: "Choose true or false",
        tags: "Enter valid JSON",
      },
    });
    expect(checkArguments(fieldsFor(schema), { a: 1, mode: "slow" })).toEqual({
      ok: false,
      errors: { mode: "Choose one of the options" },
    });
  });

  it("shows stored values as text", () => {
    expect([fieldText(undefined), fieldText("x"), fieldText(3), fieldText(["a"])]).toEqual([
      "",
      "x",
      "3",
      '["a"]',
    ]);
  });
});
