import { useState } from "react";
import { TabStrip } from "../../components/ui";
import { readPromptResult, readResourceResult, readToolResult } from "../../lib/mcp/results";
import type { McpDelivery } from "../../lib/model";
import { ContentBlocks } from "./ContentBlocks";

type View = "content" | "structured" | "raw";

const PRE =
  "max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] whitespace-pre-wrap break-all";

function Content({ delivery }: { delivery: McpDelivery }) {
  switch (delivery.operation) {
    case "tool":
      return <ContentBlocks blocks={readToolResult(delivery.result).blocks} />;
    case "resource":
      return <ContentBlocks blocks={readResourceResult(delivery.result)} />;
    case "prompt": {
      const prompt = readPromptResult(delivery.result);
      return (
        <div className="flex flex-col gap-3">
          {prompt.description && <p className="text-sm text-muted">{prompt.description}</p>}
          <ol aria-label="Prompt messages" className="flex flex-col gap-3">
            {prompt.messages.map((message, index) => (
              <li key={index} className="flex flex-col gap-1">
                <span className="text-xs font-bold tracking-wide text-muted uppercase">
                  {message.role}
                </span>
                <ContentBlocks blocks={[message.block]} />
              </li>
            ))}
          </ol>
        </div>
      );
    }
  }
}

/** What an MCP server sent back: readable content, structured output and the raw reply. */
export function McpResult({ delivery }: { delivery: McpDelivery }) {
  const [view, setView] = useState<View>("content");
  const structured =
    delivery.operation === "tool" ? readToolResult(delivery.result).structured : null;
  const views: { id: View; label: string }[] = [
    { id: "content", label: "Content" },
    ...(structured !== null ? [{ id: "structured" as const, label: "Structured" }] : []),
    { id: "raw", label: "Raw" },
  ];
  return (
    <section aria-label="Response" className="flex min-h-0 flex-col gap-2 p-4 pt-2">
      <TabStrip label="Response views" tabs={views} active={view} onChange={setView} />
      {view === "content" && <Content delivery={delivery} />}
      {view === "structured" && <pre className={PRE}>{JSON.stringify(structured, null, 2)}</pre>}
      {view === "raw" && (
        <pre aria-label="Raw reply" className={PRE}>
          {JSON.stringify(delivery.result, null, 2)}
        </pre>
      )}
    </section>
  );
}
