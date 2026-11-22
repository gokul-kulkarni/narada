import { formatDuration } from "../../lib/format";
import type { StreamMark } from "../../lib/model";
import { arrivalMs, type StreamMessage } from "../../lib/stream/sse";

/** More rows than this slow the view down; the rest stay readable in Raw. */
export const EVENT_ROW_LIMIT = 500;

interface Props {
  readonly messages: readonly StreamMessage[];
  readonly timeline: readonly StreamMark[];
}

/** Each streamed message with when it arrived, counted from dispatch. */
export function StreamEvents({ messages, timeline }: Props) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted">No complete events yet.</p>;
  }
  const shown = messages.slice(0, EVENT_ROW_LIMIT);
  const hidden = messages.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      <ol
        aria-label="Stream events"
        className="max-h-96 overflow-y-auto rounded-lg bg-surface-2 font-mono text-xs"
      >
        {shown.map((message, index) => {
          const at = arrivalMs(timeline, message.end);
          return (
            <li
              key={index}
              className="flex gap-3 border-b border-line-soft px-3 py-1.5 last:border-0"
            >
              <span className="w-16 shrink-0 text-right text-muted">
                {at === null ? "" : `+${formatDuration(at)}`}
              </span>
              {message.event !== "message" && (
                <span className="shrink-0 font-semibold text-accent-text">{message.event}</span>
              )}
              <span className="min-w-0 break-all whitespace-pre-wrap">{message.data}</span>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <p className="text-xs text-muted">
          {hidden} more {hidden === 1 ? "event" : "events"}; see Raw for the full body.
        </p>
      )}
    </div>
  );
}
