import { useEffect } from "react";
import { Button } from "../../components/ui";
import { getAssistClient } from "../../lib/assist/client";
import { preferredAgent } from "../../state/assist-settings";
import { useAssistStore } from "../../state/assist-store";
import type { RequestTab } from "../../state/tabs-store";
import { isFailing } from "./agent-context";
import { askAgent } from "./ask";

/** "Ask Claude Code" on a delivery that went wrong, when an agent is installed. */
export function AskAgentButton({ tab }: { tab: RequestTab }) {
  const available = getAssistClient() !== null;
  const agentsStatus = useAssistStore((s) => s.agentsStatus);
  const agent = useAssistStore((s) => preferredAgent(s.agents, s.settings));
  const running = useAssistStore((s) => s.runs[tab.id]?.status === "running");

  useEffect(() => {
    if (!available || agentsStatus !== "idle") return;
    void useAssistStore.getState().detect();
    void useAssistStore.getState().loadSettings();
  }, [available, agentsStatus]);

  if (!available || !agent || !isFailing(tab)) return null;
  return (
    <Button disabled={running} onClick={() => void askAgent(tab.id, agent.id)}>
      {running ? `Asking ${agent.name}…` : `Ask ${agent.name}`}
    </Button>
  );
}
