import { useState, type ReactNode } from "react";
import { TabStrip, TextArea } from "../../components/ui";
import { findHeader, prettyBody } from "../../lib/format";
import type { HttpResponse } from "../../lib/model";

type View = "pretty" | "raw" | "headers" | "tests";

interface Props {
  readonly response: HttpResponse;
  readonly testResults?: ReactNode;
  readonly testSummary?: string;
}

/** Body, headers and tests of one response; status and timing are shown by the delivery log. */
export function ResponseViewer({ response, testResults, testSummary }: Props) {
  const [view, setView] = useState<View>("pretty");
  const contentType = findHeader(response.headers, "content-type") ?? "";
  const views: { id: View; label: string }[] = [
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
