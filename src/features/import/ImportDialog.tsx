import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button, TextArea } from "../../components/ui";
import { parseCurl } from "../../lib/curl";
import { errorMessage } from "../../lib/format";
import { detectImport } from "../../lib/import-detect";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";

async function runImport(text: string): Promise<string> {
  const detected = detectImport(text);
  const workspace = useWorkspaceStore.getState();
  switch (detected.kind) {
    case "curl": {
      useTabsStore.getState().openRequest(parseCurl(detected.command), null);
      useUiStore.getState().show({ kind: "requests" });
      return "Opened the curl request in a new tab.";
    }
    case "collection":
      return `Imported collection "${(await workspace.importCollection(detected.json)).name}".`;
    case "environment":
      return `Imported environment "${(await workspace.importEnvironment(detected.json)).name}".`;
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (input: string) => {
    try {
      useUiStore.getState().notify(await runImport(input));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal title="Import" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-neutral-500">
          Paste a Postman collection or environment (v2.0/v2.1 JSON), or a curl command — or choose
          a file.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Import file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await submit(await file.text());
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
          <Button variant="primary" disabled={!text.trim()} onClick={() => void submit(text)}>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}
