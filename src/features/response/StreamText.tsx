import { streamStats, type AssembledText } from "../../lib/stream/stream-text";

interface Props {
  readonly assembled: AssembledText;
  readonly live: boolean;
}

/** The reply text of an LLM stream, joined from its pieces. */
export function StreamText({ assembled, live }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p
        aria-label="Streamed text"
        className="min-h-24 rounded-lg bg-surface-2 p-4 text-[15px] leading-relaxed whitespace-pre-wrap"
      >
        {assembled.text}
        {live && (
          <span aria-hidden="true" className="ml-0.5 animate-pulse text-accent">
            ▍
          </span>
        )}
      </p>
      <p className="text-xs text-muted">{streamStats(assembled)}</p>
    </div>
  );
}
