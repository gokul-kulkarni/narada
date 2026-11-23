import { useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { Button, TextArea } from "../../components/ui";
import { useAssistStore } from "../../state/assist-store";
import { currentFolder, currentPrompt } from "./ask";

interface Props {
  readonly tabId: string;
  readonly agentId: string;
  readonly onClose: () => void;
}

/** Shows which program will run and exactly what it will be told, before the first send. */
export function AssistPreviewDialog({ tabId, agentId, onClose }: Props) {
  const agent = useAssistStore((s) => s.agents.find((a) => a.id === agentId));
  const prompt = useMemo(() => currentPrompt(tabId), [tabId]);
  const folder = useMemo(() => currentFolder(tabId), [tabId]);
  const [skipPreview, setSkipPreview] = useState(false);
  if (!agent || prompt === null) return null;

  const send = async () => {
    onClose();
    const { confirm, start } = useAssistStore.getState();
    await confirm(agent, skipPreview);
    await start(tabId, agent, prompt, folder);
  };

  return (
    <Modal title={`Ask ${agent.name}?`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Narada will run <b>{agent.name}</b> {agent.version} on this computer, signed in as you,
          and send it the text below. It can only read: it cannot change files or reach the network.
        </p>
        <p className="flex flex-wrap items-baseline gap-2 text-muted">
          Program:
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] break-all">
            {agent.path}
          </code>
        </p>
        <p className="flex flex-wrap items-baseline gap-2 text-muted">
          Folder it may read:
          {folder ? (
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] break-all">
              {folder}
            </code>
          ) : (
            <span>none (an empty folder). Choose a project folder in Settings → Agents.</span>
          )}
        </p>
        <p className="text-muted">
          Secret variables and credentials are replaced with [redacted]. Check that nothing else
          private is left before sending.
        </p>
        <TextArea
          aria-label="What will be sent"
          readOnly
          rows={14}
          value={prompt}
          className="w-full resize-y bg-surface-2 text-[13px] leading-relaxed"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={skipPreview}
            onChange={(e) => setSkipPreview(e.target.checked)}
          />
          Don't show this preview again on this computer
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void send()}>
            Send to {agent.name}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
