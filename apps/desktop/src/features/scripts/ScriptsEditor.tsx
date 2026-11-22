import { useState } from "react";
import { Button, TabStrip, TextArea } from "../../components/ui";
import { appendSnippet, PRE_REQUEST_SNIPPETS, TEST_SNIPPETS } from "./snippets";

type Phase = "pre" | "test";

interface Props {
  readonly preRequestScript: string;
  readonly testScript: string;
  readonly onChange: (scripts: { preRequestScript: string; testScript: string }) => void;
}

export function ScriptsEditor({ preRequestScript, testScript, onChange }: Props) {
  const [phase, setPhase] = useState<Phase>("test");
  const value = phase === "pre" ? preRequestScript : testScript;
  const set = (next: string) =>
    onChange(
      phase === "pre"
        ? { preRequestScript: next, testScript }
        : { preRequestScript, testScript: next },
    );
  const snippets = phase === "pre" ? PRE_REQUEST_SNIPPETS : TEST_SNIPPETS;

  return (
    <div className="space-y-2">
      <TabStrip
        label="Script phase"
        active={phase}
        onChange={setPhase}
        tabs={[
          { id: "pre", label: `Pre-request${preRequestScript.trim() ? " •" : ""}` },
          { id: "test", label: `Tests${testScript.trim() ? " •" : ""}` },
        ]}
      />
      <div className="flex gap-2">
        <TextArea
          aria-label={phase === "pre" ? "Pre-request script" : "Test script"}
          className="h-40 flex-1"
          value={value}
          placeholder="// JavaScript with the pm.* API"
          onChange={(e) => set(e.target.value)}
        />
        <div className="flex w-44 flex-col gap-1">
          <span className="text-xs text-muted">Snippets</span>
          {snippets.map((snippet) => (
            <Button
              key={snippet.label}
              variant="ghost"
              className="px-2 py-0.5 text-left text-xs"
              onClick={() => set(appendSnippet(value, snippet))}
            >
              {snippet.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
