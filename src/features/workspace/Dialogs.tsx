import { useUiStore } from "../../state/ui-store";
import { CodeDialog } from "../codegen/CodeDialog";
import { SaveRequestDialog } from "../collections/SaveRequestDialog";
import { ImportDialog } from "../import/ImportDialog";

export function Dialogs() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore.getState().closeDialog;
  if (!dialog) return null;
  switch (dialog.kind) {
    case "import":
      return <ImportDialog onClose={close} />;
    case "save":
      return <SaveRequestDialog tabId={dialog.tabId} onClose={close} />;
    case "code":
      return <CodeDialog tabId={dialog.tabId} onClose={close} />;
  }
}
