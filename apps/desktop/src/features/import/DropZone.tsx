import { useRef, useState, type DragEvent } from "react";
import { Button } from "../../components/ui";

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      data-testid="drop-zone"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        over ? "border-accent bg-accent-soft" : "border-line"
      }`}
    >
      <p className="font-display text-lg font-semibold">Drop Postman export files here</p>
      <p className="text-xs text-muted">
        Collections (<code>*.postman_collection.json</code>) and environments (
        <code>*.postman_environment.json</code>) — several at once is fine.
      </p>
      <Button variant="primary" onClick={() => input.current?.click()}>
        Choose files…
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".json,application/json"
        aria-label="Import file"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // allow picking the same file again
          if (files.length > 0) onFiles(files);
        }}
      />
    </div>
  );
}
