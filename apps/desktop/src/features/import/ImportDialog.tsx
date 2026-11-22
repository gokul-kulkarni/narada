import { useState } from "react";
import { Modal } from "../../components/Modal";
import { TabStrip } from "../../components/ui";
import { FileImport } from "./FileImport";
import { PostmanAccountImport } from "./PostmanAccountImport";

type Source = "file" | "postman";

const SOURCES = [
  { id: "file", label: "File or text" },
  { id: "postman", label: "Postman account" },
] as const;

export function ImportDialog({
  initialFiles,
  onClose,
}: {
  initialFiles?: readonly File[];
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>("file");
  return (
    <Modal title="Import" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <TabStrip label="Import from" tabs={SOURCES} active={source} onChange={setSource} />
        {source === "file" ? (
          <FileImport initialFiles={initialFiles} onClose={onClose} />
        ) : (
          <PostmanAccountImport onClose={onClose} />
        )}
      </div>
    </Modal>
  );
}
