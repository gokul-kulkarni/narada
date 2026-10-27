import { useState, type ReactNode } from "react";
import { EmptyState, TabStrip, TextArea } from "../../components/ui";
import { findHeader, formatBytes, formatDuration, prettyBody } from "../../lib/format";
import type { HttpResponse } from "../../lib/model";

type View = "pretty" | "raw" | "headers" | "tests";

const statusColor = (status: number) =>
  status < 300 ? "text-green-600" : status < 400 ? "text-amber-600" : "text-red-600";

interface Props {
  readonly response: HttpResponse | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly testResults?: ReactNode;
  readonly testSummary?: string;
}

export function ResponseViewer({ response, error, loading, testResults, testSummary }: Props) {
  const [view, setView] = useState<View>("pretty");
  const alert = error && (
    <div
      role="alert"
      className="m-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {error}
    </div>
  );

  if (loading) return <EmptyState>Sending request…</EmptyState>;
  if (!response) return alert || <EmptyState>Send a request to see the response.</EmptyState>;

  const contentType = findHeader(response.headers, "content-type") ?? "";
  const views: { id: View; label: string }[] = [
    { id: "pretty", label: "Pretty" },
    { id: "raw", label: "Raw" },
    { id: "headers", label: `Headers (${response.headers.length})` },
    ...(testResults ? [{ id: "tests" as const, label: testSummary ?? "Tests" }] : []),
  ];

  return (
    <section aria-label="Response" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      {alert}
      <div className="flex gap-4 text-sm">
        <span className={statusColor(response.status)} data-testid="response-status">
          {response.status} {response.statusText}
        </span>
        <span>{formatDuration(response.timeMs)}</span>
        <span>{formatBytes(response.sizeBytes)}</span>
      </div>
      <TabStrip label="Response views" tabs={views} active={view} onChange={setView} />
      {response.isBinary && view !== "headers" && (
        <p className="text-sm text-neutral-500">
          Binary response ({contentType || "unknown type"}); shown as lossy text.
        </p>
      )}
      {(view === "pretty" || view === "raw") && (
        <TextArea
          aria-label="Response body"
          readOnly
          className="min-h-48 w-full flex-1"
          value={view === "pretty" ? prettyBody(response.body, contentType) : response.body}
        />
      )}
      {view === "headers" && (
        <table className="text-sm">
          <tbody>
            {response.headers.map(([key, value], index) => (
              <tr
                key={`${key}-${index}`}
                className="border-b border-neutral-100 dark:border-neutral-900"
              >
                <td className="py-1 pr-4 font-medium">{key}</td>
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
