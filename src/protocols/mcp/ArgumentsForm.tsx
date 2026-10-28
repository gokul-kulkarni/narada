import { useState } from "react";
import { Select, TextArea, TextInput } from "../../components/ui";
import { fieldText, type FormField } from "../../lib/mcp/schema-form";
import type { JsonObject } from "../../lib/model";

interface Props {
  readonly fields: readonly FormField[];
  readonly values: JsonObject;
  readonly onChange: (values: JsonObject) => void;
}

const LABEL = "flex flex-col gap-1 text-sm font-semibold";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const text = fieldText(value);
  const common = { "aria-label": field.label, value: text };
  switch (field.kind) {
    case "boolean":
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </Select>
      );
    case "enum":
      return (
        <Select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={fieldText(option)}>{fieldText(option)}</option>
          ))}
        </Select>
      );
    case "json":
      return (
        <TextArea
          {...common}
          rows={3}
          placeholder="JSON"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <TextInput
          {...common}
          className="font-mono"
          inputMode={field.kind === "string" ? undefined : "decimal"}
          placeholder={field.kind === "string" ? "text or {{variable}}" : field.kind}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** The arguments of a tool or prompt, as a form from its schema or as raw JSON. */
export function ArgumentsForm({ fields, values, onChange }: Props) {
  const [raw, setRaw] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const applyRaw = (text: string) => {
    try {
      const parsed: unknown = JSON.parse(text || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Arguments must be a JSON object.");
      }
      onChange(parsed as JsonObject);
      setRawError(null);
    } catch (error) {
      setRawError(error instanceof SyntaxError ? "Enter valid JSON." : (error as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">Arguments</span>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={raw !== null}
            onChange={(e) => setRaw(e.target.checked ? JSON.stringify(values, null, 2) : null)}
          />
          Raw JSON
        </label>
      </div>
      {raw !== null ? (
        <>
          <TextArea
            aria-label="Arguments JSON"
            rows={6}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={(e) => applyRaw(e.target.value)}
          />
          {rawError && <p className="text-xs text-err">{rawError}</p>}
        </>
      ) : fields.length === 0 ? (
        <p className="text-sm text-muted">No arguments.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <label key={field.name} className={LABEL}>
              <span>
                {field.label}
                {field.required && <span className="text-send"> *</span>}
                <span className="ml-1.5 font-mono text-[11px] font-normal text-muted">
                  {field.kind}
                </span>
              </span>
              <FieldInput
                field={field}
                value={values[field.name]}
                onChange={(value) => onChange({ ...values, [field.name]: value })}
              />
              {field.description && (
                <span className="text-xs font-normal text-muted">{field.description}</span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
