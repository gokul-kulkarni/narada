import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button, Select, TextArea } from "../../components/ui";
import { CODE_LANGUAGES, generateCode, type CodeLanguage } from "../../lib/codegen";
import { errorMessage } from "../../lib/format";
import { prepareRequest } from "../../lib/prepare-request";
import { useTabsStore } from "../../state/tabs-store";
import { inputForTab } from "../workspace/context";

export function CodeDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === tabId));
  const [language, setLanguage] = useState<CodeLanguage>("curl");
  const [copied, setCopied] = useState(false);
  if (!tab) return null;

  let code: string;
  try {
    const input = inputForTab(tab);
    code = generateCode(
      prepareRequest(tab.request, { scopes: input.scopes, authChain: input.authChain }),
      language,
    );
  } catch (error) {
    code = `// Could not generate code: ${errorMessage(error)}`;
  }

  return (
    <Modal title="Code snippet" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
          >
            {CODE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">
            Variables are resolved with the active environment. Scripts are not included.
          </span>
        </div>
        <TextArea aria-label="Generated code" readOnly className="h-64 w-full" value={code} />
        <div className="flex justify-end gap-2">
          <Button
            onClick={async () => {
              await navigator.clipboard?.writeText(code);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
