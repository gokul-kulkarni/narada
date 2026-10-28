import { useState, type ReactNode } from "react";
import { Button, Select, TabStrip, TextInput } from "../../components/ui";
import { HTTP_METHODS, type HttpMethod, type RequestDef } from "../../lib/model";
import { AuthEditor } from "./AuthEditor";
import { BodyEditor } from "./BodyEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { ParamsEditor } from "./ParamsEditor";

type Section = "params" | "headers" | "body" | "auth" | "scripts";

interface Props {
  readonly request: RequestDef;
  readonly loading: boolean;
  readonly onChange: (update: (request: RequestDef) => RequestDef) => void;
  readonly onSend: () => void;
  readonly toolbar?: ReactNode;
  readonly oauthActions?: ReactNode;
  readonly scriptsEditor?: ReactNode;
}

const countLabel = (label: string, count: number) => (count > 0 ? `${label} (${count})` : label);

export function RequestEditor({
  request,
  loading,
  onChange,
  onSend,
  toolbar,
  oauthActions,
  scriptsEditor,
}: Props) {
  const [section, setSection] = useState<Section>("params");
  const sections: { id: Section; label: string }[] = [
    { id: "params", label: "Params" },
    {
      id: "headers",
      label: countLabel("Headers", request.headers.filter((h) => h.enabled).length),
    },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
    ...(scriptsEditor ? [{ id: "scripts" as const, label: "Scripts" }] : []),
  ];

  return (
    <section
      aria-label="Compose request"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_8px_28px_rgb(31_27_46/0.06)]"
    >
      <div className="flex items-center gap-2">
        <TextInput
          aria-label="Request name"
          className="flex-1 border-transparent px-1 font-display text-xl! font-semibold hover:border-line"
          value={request.name}
          onChange={(e) => onChange((r) => ({ ...r, name: e.target.value }))}
        />
        {toolbar}
      </div>
      <form
        className="flex items-center gap-2 rounded-xl border border-line p-1 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <Select
          aria-label="HTTP method"
          className="border-transparent bg-accent-soft font-mono font-semibold text-accent-soft-ink"
          value={request.method}
          onChange={(e) => onChange((r) => ({ ...r, method: e.target.value as HttpMethod }))}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </Select>
        <TextInput
          aria-label="URL"
          className="flex-1 border-transparent font-mono focus:border-transparent"
          placeholder="https://api.example.com/resource or {{baseUrl}}/resource"
          value={request.url}
          onChange={(e) => onChange((r) => ({ ...r, url: e.target.value }))}
        />
        <Button type="submit" variant="primary" className="px-5 py-2" disabled={loading}>
          {loading ? "Dispatching…" : "Dispatch"}
        </Button>
      </form>
      <TabStrip
        label="Request sections"
        variant="chips"
        tabs={sections}
        active={section}
        onChange={setSection}
      />
      <div className="max-h-80 min-h-0 overflow-auto border-t border-line-soft pt-3">
        {section === "params" && (
          <ParamsEditor url={request.url} onUrlChange={(url) => onChange((r) => ({ ...r, url }))} />
        )}
        {section === "headers" && (
          <KeyValueEditor
            label="Headers"
            rows={request.headers}
            onChange={(headers) => onChange((r) => ({ ...r, headers }))}
          />
        )}
        {section === "body" && (
          <BodyEditor body={request.body} onChange={(body) => onChange((r) => ({ ...r, body }))} />
        )}
        {section === "auth" && (
          <AuthEditor
            auth={request.auth}
            onChange={(auth) => onChange((r) => ({ ...r, auth }))}
            oauthActions={oauthActions}
          />
        )}
        {section === "scripts" && scriptsEditor}
      </div>
    </section>
  );
}
