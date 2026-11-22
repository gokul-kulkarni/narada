import { useMemo, useState, type ReactNode } from "react";
import { TabStrip, TextArea } from "../../components/ui";
import { findHeader, prettyBody } from "../../lib/format";
import type { HttpResponse, StreamMark } from "../../lib/model";
import { parseStream, streamKind } from "../../lib/stream/sse";
import { assembleText } from "../../lib/stream/stream-text";
import { StreamEvents } from "./StreamEvents";
import { StreamText } from "./StreamText";

const NO_MARKS: readonly StreamMark[] = [];

type View = "text" | "events" | "pretty" | "raw" | "headers" | "tests";

interface Props {
  readonly response: HttpResponse;
  readonly testResults?: ReactNode;
  readonly testSummary?: string;
  /** The response is still arriving. */
  readonly live?: boolean;
}

/** Body, headers and tests of one response; status and timing are shown by the delivery log. */
export function ResponseViewer({ response, testResults, testSummary, live = false }: Props) {
  const [chosen, setView] = useState<View | null>(null);
  const contentType = findHeader(response.headers, "content-type") ?? "";
  const kind = streamKind(contentType);
  const timeline = response.timeline ?? NO_MARKS;
  const messages = useMemo(
    () => (kind ? parseStream(kind, response.body, !live) : []),
    [kind, response.body, live],
  );
  const assembled = useMemo(() => assembleText(messages, timeline), [messages, timeline]);
  // Until the user picks a view, streams open on their most readable one.
  const view = chosen ?? (assembled ? "text" : kind ? "events" : "pretty");
  const views: { id: View; label: string }[] = [
    ...(assembled ? [{ id: "text" as const, label: "Text" }] : []),
    ...(kind ? [{ id: "events" as const, label: `Events (${messages.length})` }] : []),
    { id: "pretty", label: "Pretty" },
    { id: "raw", label: "Raw" },
    { id: "headers", label: `Headers (${response.headers.length})` },
    ...(testResults ? [{ id: "tests" as const, label: testSummary ?? "Tests" }] : []),
  ];

  return (
    <section aria-label="Response" className="flex min-h-0 flex-col gap-2 p-4 pt-2">
      <TabStrip label="Response views" tabs={views} active={view} onChange={setView} />
      {response.isBinary && view !== "headers" && (
        <p className="text-sm text-muted">
          Binary response ({contentType || "unknown type"}); shown as lossy text.
        </p>
      )}
      {view === "text" && assembled && <StreamText assembled={assembled} live={live} />}
      {view === "events" && <StreamEvents messages={messages} timeline={timeline} />}
      {(view === "pretty" || view === "raw") && (
        <TextArea
          aria-label="Response body"
          readOnly
          className="min-h-64 w-full border-transparent bg-surface-2 leading-relaxed"
          value={view === "pretty" ? prettyBody(response.body, contentType) : response.body}
        />
      )}
      {view === "headers" && (
        <table className="text-sm">
          <tbody>
            {response.headers.map(([key, value], index) => (
              <tr key={`${key}-${index}`} className="border-b border-line-soft">
                <td className="py-1 pr-4 font-semibold">{key}</td>
                <td className="py-1 font-mono break-all">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view === "tests" && testResults}
    </section>
  );
}
