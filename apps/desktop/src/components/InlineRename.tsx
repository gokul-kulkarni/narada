import { useState } from "react";
import { TextInput } from "./ui";

/** Text input that commits on Enter/blur and cancels on Escape. */
export function InlineRename({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => (draft.trim() ? onCommit(draft.trim()) : onCancel());
  return (
    <TextInput
      autoFocus
      aria-label="Rename"
      className="w-full py-0.5"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}
