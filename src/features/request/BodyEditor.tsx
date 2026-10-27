import { Select, TextArea } from "../../components/ui";
import type { RawLanguage, RequestBody } from "../../lib/model";
import { KeyValueEditor } from "./KeyValueEditor";

const MODES: readonly { id: RequestBody["mode"]; label: string }[] = [
  { id: "none", label: "none" },
  { id: "raw", label: "raw" },
  { id: "urlencoded", label: "x-www-form-urlencoded" },
  { id: "formdata", label: "form-data" },
];

const LANGUAGES: readonly RawLanguage[] = ["json", "text", "xml", "html", "javascript"];

function switchMode(body: RequestBody, mode: RequestBody["mode"]): RequestBody {
  const fields = body.mode === "urlencoded" || body.mode === "formdata" ? body.fields : [];
  switch (mode) {
    case "none":
      return { mode };
    case "raw":
      return { mode, raw: body.mode === "raw" ? body.raw : "", language: "json" };
    case "urlencoded":
    case "formdata":
      return { mode, fields };
  }
}

export function BodyEditor({
  body,
  onChange,
}: {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-sm">
        {MODES.map((mode) => (
          <label key={mode.id} className="flex items-center gap-1">
            <input
              type="radio"
              name="body-mode"
              checked={body.mode === mode.id}
              onChange={() => onChange(switchMode(body, mode.id))}
            />
            {mode.label}
          </label>
        ))}
        {body.mode === "raw" && (
          <Select
            aria-label="Raw language"
            value={body.language}
            onChange={(e) => onChange({ ...body, language: e.target.value as RawLanguage })}
          >
            {LANGUAGES.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </Select>
        )}
      </div>
      {body.mode === "none" && (
        <p className="text-sm text-neutral-500">This request has no body.</p>
      )}
      {body.mode === "raw" && (
        <TextArea
          aria-label="Raw body"
          className="h-48 w-full"
          value={body.raw}
          onChange={(e) => onChange({ ...body, raw: e.target.value })}
        />
      )}
      {(body.mode === "urlencoded" || body.mode === "formdata") && (
        <KeyValueEditor
          label="Body fields"
          rows={body.fields}
          onChange={(fields) => onChange({ ...body, fields })}
        />
      )}
    </div>
  );
}
