import { useEffect, useState } from "react";
import { Button, TextArea } from "../../components/ui";
import { errorMessage } from "../../lib/format";
import { previewImport, type ImportPreview } from "../../lib/import-preview";
import { useUiStore } from "../../state/ui-store";
import { DropZone } from "./DropZone";
import { PreviewList } from "./PreviewList";
import { importPreviews } from "./run-import";

const PASTED = "Pasted text";

async function previewFiles(files: readonly File[]): Promise<ImportPreview[]> {
  return Promise.all(files.map(async (file) => previewImport(file.name, await file.text())));
}

function ExportHelp() {
  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer">How do I export from Postman?</summary>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        <li>
          <b>Collection:</b> hover the collection in Postman's sidebar → <b>⋯</b> → <b>Export</b> →
          choose <b>Collection v2.1</b> → <b>Export</b>.
        </li>
        <li>
          <b>Environment:</b> open <b>Environments</b> → hover the environment → <b>⋯</b> →{" "}
          <b>Export</b>.
        </li>
        <li>Drop the saved .json files above. Or use the Postman account tab to skip exporting.</li>
      </ol>
    </details>
  );
}

export function FileImport({
  initialFiles,
  onClose,
}: {
  initialFiles?: readonly File[];
  onClose: () => void;
}) {
  const [filePreviews, setFilePreviews] = useState<readonly ImportPreview[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: readonly File[]) => {
    const added = await previewFiles(files);
    setFilePreviews((current) => [...current, ...added]);
  };

  useEffect(() => {
    if (initialFiles?.length)
      previewFiles(initialFiles).then((added) =>
        setFilePreviews((current) => [...current, ...added]),
      );
  }, [initialFiles]);

  const previews = text.trim() ? [...filePreviews, previewImport(PASTED, text)] : filePreviews;
  const ready = previews.filter((p) => p.ok).length;

  const remove = (index: number) => {
    if (index >= filePreviews.length) setText("");
    else setFilePreviews((current) => current.filter((_, i) => i !== index));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      useUiStore.getState().notify(await importPreviews(previews));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <DropZone onFiles={(files) => void addFiles(files)} />
      <ExportHelp />
      <PreviewList previews={previews} onRemove={remove} />
      <label className="block space-y-1">
        <span className="text-xs text-neutral-500">Or paste collection JSON or a cURL command</span>
        <TextArea
          aria-label="Import text"
          className="h-24 w-full font-mono text-xs"
          placeholder="curl https://api.example.com …"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy || ready === 0} onClick={() => void submit()}>
          {ready > 1 ? `Import ${ready} items` : "Import"}
        </Button>
      </div>
    </div>
  );
}
