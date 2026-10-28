import { useState } from "react";
import { Button, TextArea } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { useUiStore } from "../../state/ui-store";
import { runImports, type NamedSource } from "./run-import";

export function FileImport({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (sources: readonly NamedSource[]) => {
    try {
      useUiStore.getState().notify(await runImports(sources));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-neutral-500">
        Paste a Postman collection or environment (v2.0/v2.1 JSON), or a curl command — or choose
        one or more exported files.
      </p>
      <input
        type="file"
        multiple
        accept=".json,application/json"
        aria-label="Import file"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length > 0)
            await submit(files.map((file) => ({ name: file.name, load: () => file.text() })));
        }}
      />
      <TextArea
        aria-label="Import text"
        className="h-48 w-full"
        placeholder="curl https://api.example.com …"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!text.trim()}
          onClick={() => void submit([{ name: "Pasted text", load: async () => text }])}
        >
          Import
        </Button>
      </div>
    </div>
  );
}
